import mysql from "mysql2/promise";

let readonlyPool = null;
let readwritePool = null;

// A pooled connection can be pinned for the legacy setCurrentUserId() helper.
// The triggers rely on a per-connection session variable, so the connection
// that runs `SET @current_user_id` must also run the following write.
let pinnedWriteConnection = null;

const BASE_FIELDS = ["host", "port", "database"];
const CREDENTIAL_FIELDS = ["user", "password"];

function assertFields(target, fields, label) {
  for (const key of fields) {
    if (
      !target ||
      target[key] === undefined ||
      target[key] === null ||
      target[key] === ""
    ) {
      throw new Error(`Database config missing required field: ${label}.${key}`);
    }
  }
}

function createRolePool(baseConfig, roleConfig, roleName) {
  assertFields(roleConfig, CREDENTIAL_FIELDS, roleName);

  const pool = mysql.createPool({
    host: baseConfig.host,
    port: baseConfig.port,
    database: baseConfig.database,
    user: roleConfig.user,
    password: roleConfig.password,
    connectionLimit:
      roleConfig.connectionLimit ?? baseConfig.connectionLimit ?? 10,
    waitForConnections: true,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    timezone: "+07:00",
    dateStrings: true,
  });

  pool.on("error", (err) => {
    console.error(`[DB:${roleName}] Pool error:`, err.code, err.message);
  });

  return pool;
}

/**
 * Create the two least-privilege pools used by the application.
 *
 * Expected shape:
 * {
 *   host, port, database, connectionLimit,
 *   readonly:  { user, password },
 *   readwrite: { user, password }
 * }
 *
 * The application never receives the admin credentials.
 */
export function createPools(config) {
  assertFields(config, BASE_FIELDS, "database");

  readonlyPool = createRolePool(config, config.readonly, "readonly");
  readwritePool = createRolePool(config, config.readwrite, "readwrite");

  return { readonlyPool, readwritePool };
}

// Kept for backwards compatibility with existing scripts.
export function createPool(config) {
  return createPools(config);
}

export function getReadonlyPool() {
  if (!readonlyPool) {
    throw new Error(
      "Readonly database pool not initialized. Call createPools() first."
    );
  }
  return readonlyPool;
}

export function getReadwritePool() {
  if (!readwritePool) {
    throw new Error(
      "Readwrite database pool not initialized. Call createPools() first."
    );
  }
  return readwritePool;
}

// Default pool for callers that expect a single application pool. Reads that
// go through query() still use the readonly pool.
export function getPool() {
  return getReadwritePool();
}

/**
 * Run a read-only statement against the readonly pool.
 */
export async function query(sql, params = []) {
  const p = getReadonlyPool();
  const [rows] = await p.execute(sql, params);
  return rows;
}

/**
 * Run a write statement against the readwrite pool. If a connection has been
 * pinned by setCurrentUserId(), that connection is reused so contributors are
 * attributed to the correct user.
 */
export async function execute(sql, params = []) {
  const target = pinnedWriteConnection ?? getReadwritePool();
  const [result] = await target.execute(sql, params);
  return result;
}

/**
 * Run a statement against the readwrite pool when metadata visibility (for
 * example SHOW TRIGGERS) requires more than the readonly role's SELECT grant.
 * This is still not DDL: the readwrite role has no CREATE/ALTER/DROP rights.
 */
export async function queryReadwrite(sql, params = []) {
  const p = getReadwritePool();
  const [rows] = await p.execute(sql, params);
  return rows;
}

/**
 * Execute a read-only stored procedure against the readonly pool.
 */
export async function callProcedure(name, params = []) {
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error(`Invalid stored procedure name: ${name}`);
  }

  const p = getReadonlyPool();
  const placeholders = params.map(() => "?").join(", ");
  const [results] = await p.query(`CALL \`${name}\`(${placeholders})`, params);

  // mysql2 returns an array of result sets for CALL statements.
  return Array.isArray(results) && Array.isArray(results[0]) ? results : [results];
}

export async function getConnection() {
  return getReadwritePool().getConnection();
}

export async function getReadonlyConnection() {
  return getReadonlyPool().getConnection();
}

export async function transaction(callback) {
  // If a connection is pinned, use it so @current_user_id and the writes in
  // this transaction share the same session. clearCurrentUserId() releases it.
  const pinned = pinnedWriteConnection;
  const conn = pinned ?? (await getConnection());
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    if (!pinned) conn.release();
  }
}

export async function close() {
  if (pinnedWriteConnection) {
    try {
      await pinnedWriteConnection.execute("SET @current_user_id = NULL");
    } catch {
      // The connection may already be gone; still release it.
    }
    pinnedWriteConnection.release();
    pinnedWriteConnection = null;
  }

  const pools = [readonlyPool, readwritePool].filter(Boolean);
  readonlyPool = null;
  readwritePool = null;

  await Promise.all(pools.map((p) => p.end()));
}

export async function paginate(baseQuery, params = [], page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const countQuery = `SELECT COUNT(*) AS total FROM (${baseQuery}) AS sub_count`;
  const countResult = await query(countQuery, params);
  const total = countResult[0]?.total || 0;
  const dataQuery = `${baseQuery} LIMIT ? OFFSET ?`;
  const data = await query(dataQuery, [...params, limit, offset]);
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
    },
  };
}

export function buildWhere(filters, prefix = "") {
  const conditions = [];
  const params = [];

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;

    const col = prefix ? `${prefix}.${key}` : key;

    if (Array.isArray(value)) {
      conditions.push(`${col} IN (${value.map(() => "?").join(",")})`);
      params.push(...value);
    } else if (typeof value === "object" && value.operator) {
      conditions.push(`${col} ${value.operator} ?`);
      params.push(value.value);
    } else {
      conditions.push(`${col} = ?`);
      params.push(value);
    }
  }

  return { where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", params };
}

export function buildOrderBy(sort, allowedFields = []) {
  if (!sort) return "";
  const [field, direction] = sort.split(":");
  if (allowedFields.length && !allowedFields.includes(field)) return "";
  const dir = direction?.toUpperCase() === "DESC" ? "DESC" : "ASC";
  return `ORDER BY ${field} ${dir}`;
}

/**
 * Pin a readwrite connection and set @current_user_id on it. Intended for
 * standalone scripts/tests; request handlers should set the variable inside
 * transaction() on the connection that performs the write.
 */
export async function setCurrentUserId(userId) {
  if (!pinnedWriteConnection) {
    pinnedWriteConnection = await getConnection();
  }
  await pinnedWriteConnection.execute("SET @current_user_id = ?", [userId]);
}

export async function clearCurrentUserId() {
  if (!pinnedWriteConnection) return;

  const conn = pinnedWriteConnection;
  pinnedWriteConnection = null;

  try {
    await conn.execute("SET @current_user_id = NULL");
  } finally {
    conn.release();
  }
}

export default {
  createPools,
  createPool,
  getPool,
  getReadonlyPool,
  getReadwritePool,
  query,
  queryReadwrite,
  execute,
  callProcedure,
  getConnection,
  getReadonlyConnection,
  transaction,
  close,
  paginate,
  buildWhere,
  buildOrderBy,
  setCurrentUserId,
  clearCurrentUserId,
};

// P.S. LGTM
// - Kyle
