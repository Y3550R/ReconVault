# Database Setup Documentation

## Overview
Complete database foundation for ReconVault prototype. MariaDB 13.0.2 on isolated port 3315 with three access roles (readonly, readwrite, admin), 19 tables, 7 triggers, 28 foreign keys, and comprehensive test suite (60/60 passing).

---

## Database Server

| Property | Value |
|----------|-------|
| **Engine** | MariaDB 13.0.2 |
| **Port** | 3315 (isolated from other MariaDB instances) |
| **Data Directory** | `/tmp/mariadb-data` (ephemeral, recreated on startup) |
| **Socket** | `/tmp/mariadb.sock` |
| **Users (for webapp)** | readonly + readwrite roles (admin is provisioning-only) |
| **Database** | in `.env` |
| **Charset** | utf8mb4 / utf8mb4_unicode_ci |

### Binary Paths (explicit, no PATH lookups)
```
/usr/bin/mariadb       # client
/usr/bin/mariadbd      # server
/usr/bin/mariadb-install-db  # initialization
```

---

## Code Files

### `src/config/index.js`
- Loads `.env` via dotenv
- **Validates required env vars at startup** — throws if missing
- Required: `SESSION_SECRET`, `NMAP_PATH`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_READONLY_USER`, `DB_READONLY_PASS`, `DB_READWRITE_USER`, `DB_READWRITE_PASS`, `DB_DEFAULT_ADMIN_USER`, `DB_DEFAULT_ADMIN_PASS`
- `DB_ADMIN_USER` / `DB_ADMIN_PASS` are **not** loaded by the app; only `runServer_test.sh` uses them
- **No fallbacks for required values**
- Optional fallbacks only: `SESSION_NAME`, `SESSION_MAX_AGE`, `connectionLimit`, argon2 params

### `src/db.js`
- `createPools(config)` — creates the readonly and readwrite pools; throws on missing config fields
- `query()` → readonly pool; `execute()` / `transaction()` / `getConnection()` → readwrite pool
- `queryReadwrite()` → readwrite pool for metadata visibility (e.g. `SHOW TRIGGERS`); the readwrite role still has no DDL rights
- `callProcedure()` → readonly pool (stored procedures are read-only)
- Helpers: `getReadonlyPool()`, `getReadwritePool()`, `close()`
- `paginate(baseQuery, params, page, limit)` — offset pagination with count (readonly)
- `buildWhere(filters, prefix)` — dynamic WHERE clauses
- `buildOrderBy(sort, allowedFields)` — safe ORDER BY
- `setCurrentUserId(userId)` / `clearCurrentUserId()` — pin a readwrite connection and set the trigger session variable (scripts/tests only; request handlers use `transaction()`)

### `tests/db_test.js` (60 tests)
| Category | Tests |
|----------|-------|
| Connection | 1 |
| Schema existence | 19 |
| Trigger existence | 7 |
| Foreign keys | 1 |
| CRUD operations | 5 |
| Runtime trigger verification | 10 |
| Helper functions | 6 |
| Transactions | 1 |
| Pagination | 4 |
| Scan contributor type | 3 |
| Cleanup | 1 |

**All 60 passing.**

---

## Startup Script: `runServer_test.sh`

### Features
- Starts MariaDB on port 3315 with isolated data dir
- Initializes data dir if missing (`mariadb-install-db`)
- Creates the `readonly`, `readwrite`, and `admin` MariaDB users with least-privilege grants
- Applies `database/schema.sql` as the admin role
- Seeds the initial webapp administrator using the admin role
- Starts Node app (`src/server.js`)
- Health checks for both DB and app
- **Full cleanup on exit** (Ctrl+C, SIGTERM, errors)
- **Explicit binary paths** (no PATH lookups)

### Configurable via Environment
| Variable | Default |
|----------|---------|
| `MARIADB_BIN` | `/usr/bin/mariadb` |
| `MARIADBD_BIN` | `/usr/bin/mariadbd` |
| `MARIADB_INSTALL_DB_BIN` | `/usr/bin/mariadb-install-db` |
| `NODE_BIN` | `/usr/bin/node` |
| `NPM_BIN` | `/usr/bin/npm` |
| `CURL_BIN` | `/usr/bin/curl` |

### Validation
- Checks all binaries exist and are executable before starting

---

## Environment (`.env`)

**Required (validated at startup):**
- `SESSION_SECRET` — session signing secret
- `NMAP_PATH` — full path to nmap binary
- `DB_HOST` — database host
- `DB_PORT` — database port
- `DB_NAME` — database name
- `DB_READONLY_USER` / `DB_READONLY_PASS` — read-only database role
- `DB_READWRITE_USER` / `DB_READWRITE_PASS` — read-write database role
- `DB_DEFAULT_ADMIN_USER` — webapp admin username
- `DB_DEFAULT_ADMIN_PASS` — webapp admin password

**Provisioning-only (used by `runServer_test.sh`, not loaded by the app):**
- `DB_ROOT_PASS` — MariaDB root password
- `DB_ADMIN_USER` / `DB_ADMIN_PASS` — database admin role used for schema/seed

**Database role grants:**

| Role | Grants | Used by |
|---|---|---|
| `readonly` | `SELECT`, `EXECUTE` | `query()`, `callProcedure()` |
| `readwrite` | `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `EXECUTE` | `execute()`, `transaction()`, session store |
| `admin` | `ALL PRIVILEGES` on `DB_NAME` | schema provisioning and admin seeding only |

The running app never reads `DB_ADMIN_USER` / `DB_ADMIN_PASS`.

**Optional with defaults:**
- `HOST` — app host (default: 127.0.0.1)
- `PORT` — app port (default: 3000)
- `SESSION_NAME` — cookie name (default: `reconvault.sid`)
- `SESSION_MAX_AGE` — cookie max age ms (default: 86400000)
- `SESSION_SECURE` — secure cookie flag (default: `false`; set `true` with TLS)
- `TLS_ENABLED` — serve HTTPS when `true`/`1` (default: `false`)
- `TLS_KEY_PATH` — TLS private key path (default: `/etc/ssl/reconvault/server.key`)
- `TLS_CERT_PATH` — TLS certificate path (default: `/etc/ssl/reconvault/server.crt`)
- `TLS_CA_PATH` — optional CA bundle path (default: none)
- `DB_CONNECTION_LIMIT` — pool size (default: 10)
- `ARGON2_MEMORY` — argon2 memory cost (default: 65536)
- `ARGON2_ITERATIONS` — argon2 time cost (default: 3)
- `ARGON2_PARALLELISM` — argon2 parallelism (default: 4)
- `NODE_ENV` — environment (default: `development`)
- `LOG_LEVEL` — log level (default: `info`)

> **Never commit `.env`** — it's in `.gitignore`. Use `.env.example` as template.

---

## Security Conventions

1. **Least-privilege DB roles** — app uses `readonly` for reads and `readwrite` for writes; `admin` is provisioning-only
2. **No fallback defaults** for secrets/paths in code
3. **`.env` in `.gitignore`** — never committed
4. **Prepared statements only** — `pool.execute(sql, params)`
5. **Session variable for triggers** — `@current_user_id` set per-request
6. **Hard delete only** — no soft delete columns

---

## Commands

```bash
npm install              # install deps
npm test                 # run 60 db tests (tests/db_test.js)
./runServer_test.sh                 # start MariaDB + app for testing (full lifecycle)
# Database CLI:
/usr/bin/mariadb --socket=/tmp/mariadb.sock -u root -p
```

---

## Key Gotchas

- **Overlapping roles** — one user can be Admin + Pentester + Client
- **Client org nullable** — clients without org see empty dashboard
- **Contributor triggers** — request handlers set `@current_user_id` on the transaction connection before INSERT/UPDATE on targets/services/findings; scripts can use `setCurrentUserId()`
- **Scan state machine** — `READY → RUNNING → COMPLETED/FAILED/CANCELLED` (linear, no back-transitions)
- **Scans only run when engagement = ACTIVE** — enforced in app middleware
- **nmap binary required** — path configured in `.env`
- **No migrations tool** — apply `database/schema.sql` manually
- **Never use other MariaDB ports** — all ops on port 3315
