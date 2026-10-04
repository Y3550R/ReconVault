import mysql from "mysql2/promise";

let pool = null;

export function createPool(config) {
  const required = ["host", "port", "user", "password", "database"];
  for (const key of required) {
    if (config[key] === undefined || config[key] === null || config[key] === "") {
      throw new Error(`Database config missing required field: ${key}`);
    }
  }

  pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectionLimit: config.connectionLimit ?? 10,
    waitForConnections: true,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    timezone: "Z",
    dateStrings: true,
  });

  pool.on("error", (err) => {
    console.error("[DB] Pool error:", err.code, err.message);
  });

  return pool;
}

export function getPool() {
  if (!pool) {
    throw new Error("Database pool not initialized. Call createPool() first.");
  }
  return pool;
}

export async function query(sql, params = []) {
  const p = getPool();
  const [rows] = await p.execute(sql, params);
  return rows;
}

export async function execute(sql, params = []) {
  const p = getPool();
  const [result] = await p.execute(sql, params);
  return result;
}

export async function getConnection() {
  const p = getPool();
  return p.getConnection();
}

export async function transaction(callback) {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
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

export function setCurrentUserId(userId) {
  return query("SET @current_user_id = ?", [userId]);
}

export function clearCurrentUserId() {
  return query("SET @current_user_id = NULL");
}

export default {
  createPool,
  getPool,
  query,
  execute,
  getConnection,
  transaction,
  close,
  paginate,
  buildWhere,
  buildOrderBy,
  setCurrentUserId,
  clearCurrentUserId,
};