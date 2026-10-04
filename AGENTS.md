# ReconVault - Agent Implementation Guide (Prototype)

> **Note**: The original `AGENTS.md` (see git history) was a comprehensive long-term specification with 25 decision points, full scan engine, audit logging, engagement scope, and 20 tables. This version reflects the **simplified prototype scope** for the Database Programming course.

---

## Prototype Scope (Current)

| Layer | Technology | Notes |
|-------|------------|-------|
| Frontend | Static HTML/CSS/JS | REST API consumer (`/api/*`), no framework |
| Backend | Node.js 20+ + Express 4.x | REST endpoints, server-side sessions |
| Database | MariaDB 13.0.2 / MySQL 8.0+ | 15 core tables, triggers, procedures |
| Auth | Argon2id + express-session + express-mysql-session | HttpOnly cookies |
| Scan Engine | `child_process` → `nmap` binary | Host discovery (`-sn`) + Port scan (`-sS`) only |
| Config | `dotenv` | `.env` for local dev |
| Validation | Manual + prepared statements | No express-validator for prototype |

### Prototype Features (Full CRUD + Basic Scans)

- **Auth**: Login/logout, session management, role detection
- **Admin**: User management, client orgs, engagements, team assignment
- **Pentester**: Targets, services, findings, scan management
- **Client**: Read-only engagement views
- **Scans**: CRUD + execute (host discovery + port scan via nmap)

### Deferred to Future Versions

- Service detection (`-sV`), OS detection, vulnerability scanning
- `engagement_scope` table, `audit_log` table, scan_* junction tables
- Bootstrap/UI polish, OpenAPI spec, test framework, CI/CD
- Rate limiting, helmet, compression, advanced RBAC middleware

---

## Quick Reference (Prototype)

### Stack
```bash
# Dependencies (package.json)
express, mysql2, argon2, express-session, express-mysql-session, dotenv
```

### Database
- **15 tables**: users, administrators, pentesters, clients, client_organizations, engagements, engagement_members, engagement_organizations, targets, services, findings, finding_targets, finding_services, contributors (polymorphic), target_contributors, service_contributors, finding_contributors, scans, sessions
- **7 triggers**: contributor tracking (targets, services, findings) + scan finished_at
- **6 stored procedures**: engagement summary, engagement findings, target recon, scan results, user engagements, open findings

### Roles (Overlapping Subclasses)
- **Administrator**: Full system access
- **Pentester**: Assigned engagements only
- **Client**: Org-associated engagements only

### Scan Types (Prototype)
- `HOST` — Host discovery only (`nmap -sn`)
- `PORT` — Port scan (`nmap -sS`)

### Status Enums
```
ENGAGEMENT: PLANNED, ACTIVE, COMPLETED, CANCELLED
SCAN: READY, RUNNING, COMPLETED, FAILED, CANCELLED
SCAN_TYPE: HOST, PORT
TARGET: ACTIVE, INACTIVE
SERVICE_STATE: UNKNOWN, OPEN, CLOSED, FILTERED
FINDING_SEVERITY: CRITICAL, HIGH, MEDIUM, LOW, INFO
FINDING_STATUS: OPEN, IN PROGRESS, RESOLVED, ACCEPTED
USER: ACTIVE, INACTIVE
CONTRIBUTOR: SCAN, PENTESTER
PROTOCOL: TCP, UDP, SCTP, ICMP
```

---

## Implementation Order (Prototype)

| Phase | Deliverable | Key Files |
|-------|-------------|-----------|
| **1** | Database schema + triggers + procedures | `database/schema.sql` |
| **2** | Config + DB pool | `src/config/index.js`, `src/db.js` |
| **3** | Middleware (auth, errorHandler) | `src/middleware/auth.js`, `src/middleware/errorHandler.js` |
| **4** | Services (password, scanEngine) | `src/services/password.js`, `src/services/scanEngine.js` |
| **5** | Utils (db helpers, validation) | `src/utils/db.js`, `src/utils/validation.js` |
| **6** | Controllers (all 8) | `src/controllers/*.js` |
| **7** | Routes (all 8) | `src/routes/*.js` |
| **8** | App wiring | `src/app.js` |
| **9** | Frontend (static HTML/JS) | `public/*.html`, `public/js/*.js` |
| **10** | Package + env + test | `package.json`, `.env.example` |

### Directory Structure (Prototype)

```
database/
  schema.sql           # Full DDL (19 tables + triggers + procedures)

src/
  app.js               # Express app, middleware stack, route mounting
  db.js                # mysql2 pool + query/execute/transaction helpers
  config/
    index.js           # dotenv, session config, argon2 params, nmap path
  middleware/
    auth.js            # attachUser, requireAuth, requireAdmin, requirePentester, requireEngagementAccess
    errorHandler.js    # centralized error responses
  routes/
    auth.js            # POST /api/login, POST /api/logout, GET /api/me
    engagements.js     # CRUD /api/engagements
    targets.js         # CRUD /api/engagements/:id/targets
    services.js        # CRUD /api/targets/:id/services
    findings.js        # CRUD /api/engagements/:id/findings
    scans.js           # CRUD + execute /api/engagements/:id/scans
    admin/
      users.js         # /api/admin/users
      organizations.js # /api/admin/organizations
  controllers/
    authController.js
    engagementController.js
    targetController.js
    serviceController.js
    findingController.js
    scanController.js
    adminUserController.js
    adminOrgController.js
  services/
    scanEngine.js      # nmap spawn, parse XML, return structured data
    password.js        # hashPassword, verifyPassword (argon2)
  utils/
    db.js              # pagination, buildWhere, buildOrderBy, etc.
    validation.js      # basic validators (IP, port, enums, CIDR)

public/
  index.html           # Login
  dashboard.html       # Engagement list
  engagement.html      # Engagement detail (tabs)
  admin.html           # Admin panel
  css/style.css
  js/api.js            # fetch wrapper
  js/*.js              # Page logic

.env.example
package.json
README.md
AGENTS.md
```

---

## Conventions (Prototype)

- **Parameterized queries only** — `pool.execute(sql, params)`
- **Session auth on all `/api/*`** — check `req.session.user`
- **Role checks in routes** — `req.user.roles.isAdmin` etc.
- **Engagement access** — middleware verifies membership
- **Hard delete only**
- **No input validation library** — trust prepared statements + basic checks

### Database Conventions
- **Use dedicated DB user** — `reconvault` (not root). Configured in `.env`.
- **No fallback defaults in `db.js`** — throws on missing config.
- **MariaDB on port 3315** — isolated from other MariaDB instances on the system.
- **Data dir in `/tmp/mariadb-data`** — ephemeral, recreated on startup.

### Environment & Security
- **`.env` for secrets** — never committed (in `.gitignore`).
- **`.gitignore`** — excludes `.env`, `node_modules`, MariaDB data, logs.
- **Tests in `tests/`** — `npm test` runs `tests/db_test.js`.

### Startup Script
- **`run.sh`** — starts MariaDB, configures users, starts app, cleans up on exit.
- **Never use other MariaDB ports** or directories outside project.

### Binary Path Convention
- **No PATH lookups** — all binaries use explicit full paths.
- **Configurable via env** — `MARIADB_BIN`, `MARIADBD_BIN`, `MARIADB_INSTALL_DB_BIN`, `NODE_BIN`, `NPM_BIN`, `CURL_BIN`.
- **Defaults** — `/usr/bin/mariadb`, `/usr/bin/mariadbd`, `/usr/bin/mariadb-install-db`, `/usr/bin/node`, `/usr/bin/npm`, `/usr/bin/curl`.
- **Validation** — script checks executables exist and are executable before starting.

---

## Common Commands

```bash
npm install              # install deps
npm run dev              # nodemon src/server.js (or node --watch)
npm test                 # run tests (tests/db_test.js)
./run.sh                 # start everything (MariaDB + app)
# Database: mariadb --protocol=tcp --port=3315 -u reconvault -p
```

---

## Gotchas (Prototype)

- **Overlapping roles** — one user can be Admin + Pentester + Client simultaneously
- **Client org nullable** — clients without org see empty dashboard
- **Contributor triggers** — use `@current_user_id` session variable (set in app before write)
- **Scan status machine** — `READY → RUNNING → COMPLETED/FAILED/CANCELLED` (linear)
- **Scans only run when engagement = ACTIVE**
- **No migrations tool** — apply `schema.sql` manually for prototype

---

## Reference Files

- `README.md` — one-line project description
- `database/schema.sql` — canonical DDL (source of truth)
- Git history of this file — original long-term specification
- `docs/DECISIONS.md` — original 25 decision points (for future reference)