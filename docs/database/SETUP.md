# Database Setup Documentation

## Overview
Complete database foundation for ReconVault prototype. MariaDB 13.0.2 on isolated port 3315 with dedicated user, 19 tables, 7 triggers, 28 foreign keys, and comprehensive test suite (60/60 passing).

---

## Database Server

| Property | Value |
|----------|-------|
| **Engine** | MariaDB 13.0.2 |
| **Port** | 3315 (isolated from other MariaDB instances) |
| **Data Directory** | `/tmp/mariadb-data` (ephemeral, recreated on startup) |
| **Socket** | `/tmp/mariadb.sock` |
| **User (For webapp)** | in `.env` |
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
- **Validates 7 required env vars at startup** — throws if missing
- Required: `SESSION_SECRET`, `NMAP_PATH`, `DB_HOST`, `DB_PORT`, `DB_ROOT_PASS`, `DB_WEB_USER`, `DB_WEB_PASS`, `DB_NAME`, `DB_DEFAULT_ADMIN_USER`, `DB_DEFAULT_ADMIN_PASS`
- **No fallbacks for required values**
- Optional fallbacks only: `SESSION_NAME`, `SESSION_MAX_AGE`, `connectionLimit`, argon2 params

### `src/db.js`
- `createPool(config)` — strict, no defaults, throws on missing config fields
- Helpers: `query()`, `execute()`, `getConnection()`, `transaction()`, `close()`
- `paginate(baseQuery, params, page, limit)` — offset pagination with count
- `buildWhere(filters, prefix)` — dynamic WHERE clauses
- `buildOrderBy(sort, allowedFields)` — safe ORDER BY
- `setCurrentUserId(userId)` / `clearCurrentUserId()` — for trigger session variable

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
- Creates/grants `reconvault` user
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
- `DB_ROOT_PASS` — database root password
- `DB_WEB_USER` — database webapp username
- `DB_WEB_PASS` — database webapp password
- `DB_DEFAULT_ADMIN_USER` — webapp admin username
- `DB_DEFAULT_ADMIN_PASS` — webapp admin password

**Optional with defaults:**
- `HOST` — app host (default: 127.0.0.1)
- `PORT` — app port (default: 3000)
- `SESSION_NAME` — cookie name (default: `reconvault.sid`)
- `SESSION_MAX_AGE` — cookie max age ms (default: 86400000)
- `SESSION_SECURE` — secure cookie flag (default: `false`)
- `DB_CONNECTION_LIMIT` — pool size (default: 10)
- `ARGON2_MEMORY` — argon2 memory cost (default: 65536)
- `ARGON2_ITERATIONS` — argon2 time cost (default: 3)
- `ARGON2_PARALLELISM` — argon2 parallelism (default: 4)
- `NODE_ENV` — environment (default: `development`)
- `LOG_LEVEL` — log level (default: `info`)

> **Never commit `.env`** — it's in `.gitignore`. Use `.env.example` as template.

---

## Security Conventions

1. **Dedicated DB user** — e.g. `reconvault` (not root)
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
- **Contributor triggers** — app MUST call `setCurrentUserId(userId)` before INSERT/UPDATE on targets/services/findings
- **Scan state machine** — `READY → RUNNING → COMPLETED/FAILED/CANCELLED` (linear, no back-transitions)
- **Scans only run when engagement = ACTIVE** — enforced in app middleware
- **nmap binary required** — path configured in `.env`
- **No migrations tool** — apply `database/schema.sql` manually
- **Never use other MariaDB ports** — all ops on port 3315
