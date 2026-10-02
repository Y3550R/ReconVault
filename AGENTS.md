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
| **2** | Config + DB pool + session store | `src/config/index.js`, `src/config/database.js` |
| **3** | Auth (login, logout, session, roles) | `src/middleware/auth.js`, `src/routes/auth.js` |
| **4** | API routes (REST) | `src/routes/*.js` |
| **5** | Scan engine (nmap wrapper) | `src/services/scanEngine.js` |
| **6** | Frontend (static HTML/JS) | `public/*.html`, `public/js/*.js` |
| **7** | Integration + manual testing | — |

### Directory Structure (Prototype)

```
database/
  schema.sql           # Full DDL (15 tables + triggers + procedures)

src/
  config/
    index.js           # dotenv config
    database.js        # mysql2/promise pool
  middleware/
    auth.js            # Session verify, role detection
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
  services/
    scanEngine.js      # nmap spawn, parse XML/JSON output

public/
  index.html           # Login page
  dashboard.html       # Engagement list
  engagement.html      # Engagement detail (tabs: targets, services, findings, scans)
  admin.html           # Admin panel
  css/style.css        # Minimal styling
  js/api.js            # fetch() wrapper
  js/*.js              # Page-specific logic

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
- **nmap check at startup** — `which nmap` or spawn `nmap --version`

---

## Common Commands

```bash
npm install              # install deps
npm run dev              # nodemon src/server.js (or node --watch)
# Database: manually run schema.sql in MariaDB/MySQL
```

---

## Gotchas (Prototype)

- **Overlapping roles** — one user can be Admin + Pentester + Client simultaneously
- **Client org nullable** — clients without org see empty dashboard
- **Contributor triggers** — use `@current_user_id` session variable (set in app before write)
- **Scan status machine** — `READY → RUNNING → COMPLETED/FAILED/CANCELLED` (linear)
- **Scans only run when engagement = ACTIVE**
- **nmap binary required** — check at startup, graceful degradation
- **No migrations tool** — apply `schema.sql` manually for prototype

---

## Reference Files

- `README.md` — one-line project description
- `database/schema.sql` — canonical DDL (source of truth)
- Git history of this file — original long-term specification
- `docs/DECISIONS.md` — original 25 decision points (for future reference)