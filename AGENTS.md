# ReconVault - Agent Implementation Guide

**Status**: Greenfield project — specification finalized, all 25 decision points resolved. See `docs/DECISIONS.md` for full log.

## Quick Reference

| Layer | Technology | Notes |
|-------|------------|-------|
| Frontend | HTML/CSS/JS + Bootstrap 5 | Server-rendered (EJS), minimal JS |
| Backend | Node.js 20+ + Express 4.x | REST endpoints, server-side sessions |
| Database | MySQL 8.0+ | Schema in `database/schema.sql` |
| Auth | Argon2id + express-session + express-mysql-session | HttpOnly, Secure, SameSite=Strict cookies |
| Scan Engine | Custom Node.js + BullMQ/Redis | Host discovery → port scan → service detection |
| API Docs | OpenAPI 3.1 | `docs/api/openapi.yaml` |
| Testing | Jest + Supertest | Separate test DB, `seed.sql` |
| Migrations | node-db-migrate | SQL-based migrations |

## Specification Source

The detailed requirements live in git history of this file (original 200-line spec). Key updates from review:

- **3 roles**: Administrator, Pentester, Client (overlapping subclasses of User)
- **11 UI pages** with CRUD mappings (unchanged)
- **20 MySQL tables** (15 original + 5 new: `engagement_scope`, `scan_targets`, `scan_services`, `scan_findings`, `audit_log`)
- **Modified tables**: `scans` adds `scan_type`; 6 key tables add `created_at`/`updated_at`; `findings` adds `references`, `cvss_vector`, `remediation`
- **6 stored procedures**, **6 triggers** (4 original + 2 new for scan validation)
- **Security**: Argon2id, RBAC, parameterized queries, HTTPS, audit logging

## Implementation Order (Database First)

| Phase | Deliverable | Key Files |
|-------|-------------|-----------|
| **0** | Repo scaffolding | `package.json`, `.env.example`, `.gitignore`, `eslint.config.js`, folders |
| **1** | Database schema (all 20 tables) | `database/schema.sql` |
| **2** | Triggers, procedures, scope logic | `database/triggers.sql`, `database/procedures.sql` |
| **3** | Migrations (`node-db-migrate`) | `database/migrations/001_init.sql` |
| **4** | Config, DB pool, OpenAPI spec | `src/config/`, `docs/api/openapi.yaml` |
| **5** | Auth (sessions, Argon2id, login/logout) | `src/middleware/auth.js`, `src/routes/auth.js` |
| **6** | RBAC + engagement access middleware | `src/middleware/rbac.js`, `src/middleware/engagementAccess.js` |
| **7** | Admin pages (users, orgs, engagements, team) | `src/routes/users.js`, `organizations.js`, `engagements.js`, `engagementTeam.js` |
| **8** | Targets & Services (+ contributor triggers) | `src/routes/targets.js`, `services.js` |
| **9** | Findings (with new fields) | `src/routes/findings.js` |
| **10** | Scan Management (CRUD + status machine) | `src/routes/scans.js` |
| **11** | **Scan Engine** (host discovery → port scan → service detection → auto-create) | `src/services/scanEngine.js`, `src/workers/scanWorker.js` |
| **12** | Client read-only views | `src/routes/client/*.js` |
| **13** | UI polish + Bootstrap | `src/views/`, `public/` |
| **14** | Tests + CI | `tests/`, `.github/workflows/ci.yml` |
| **15** | Docs + hardening | `docs/`, helmet, rate-limit, backup |

## Conventions to Follow

- **Parameterized queries only** — no string interpolation in SQL
- **Server-side authorization** on every route — check role + engagement access
- **Status enums** exactly as specified:
  - `ENGAGEMENT_STATUS`: PLANNED, ACTIVE, COMPLETED, CANCELLED
  - `SCAN_STATUS`: READY, RUNNING, COMPLETED, FAILED, CANCELLED
  - `SCAN_TYPE`: HOST, PORT, SERVICE
  - `TARGET_STATUS`: ACTIVE, INACTIVE
  - `SERVICE_STATE`: UNKNOWN, OPEN, CLOSED, FILTERED
  - `FINDING_SEVERITY`: CRITICAL, HIGH, MEDIUM, LOW, INFO
  - `FINDING_STATUS`: OPEN, IN PROGRESS, RESOLVED, ACCEPTED
  - `USER_STATUS`: ACTIVE, INACTIVE
  - `CONTRIBUTOR_TYPE`: SCAN, PENTESTER
- **Contributor tracking** via `contributors` polymorphic table (SCAN or PENTESTER) + junction tables
- **Session cookie**: `HttpOnly`, `Secure`, `SameSite=Strict`
- **Pagination**: `?page=1&limit=20&sort=created_at:desc&filter[status]=ACTIVE`
- **Hard delete only** — no soft delete
- **Validation**: shared validators in `src/utils/validation.js` (IPv4/IPv6, port 1-65535, enums, ISO dates)

## Directory Structure

```
database/
  schema.sql           # Full DDL (20 tables)
  triggers.sql         # 6 triggers
  procedures.sql       # 6 stored procedures
  migrations/
    001_init.sql       # Baseline migration
  seed.sql             # Dev/test seed data

src/
  app.js               # Express app factory
  server.js            # Entry point (listen)
  config/
    index.js           # Config loader (dotenv + Joi)
    database.js        # MySQL pool (mysql2/promise)
  middleware/
    auth.js            # Session verify, attach req.user
    rbac.js            # Role guards (requireAdmin, requirePentester, requireClient)
    engagementAccess.js# Engagement membership check
    validation.js      # express-validator rules
    errorHandler.js    # Centralized error responses
  routes/
    auth.js            # POST /login, POST /logout
    engagements.js     # CRUD + list (Page 2)
    engagementTeam.js  # Page 4
    targets.js         # Pages 5-6
    services.js        # Page 6
    findings.js        # Pages 7-8
    scans.js           # Page 9
    users.js           # Page 10
    organizations.js   # Page 11
    client/            # Client read-only views
  services/
    userService.js
    engagementService.js
    targetService.js
    serviceService.js
    findingService.js
    scanService.js
    scanEngine.js      # Scan execution logic
    organizationService.js
  utils/
    password.js        # argon2id hash/verify
    db.js              # Query helpers (transaction, pagination)
    validation.js      # Shared validators
  views/               # EJS templates
    layout.ejs
    login.ejs
    engagements/
    targets/
    findings/
    scans/
    admin/
    client/
    partials/

public/
  css/app.css          # Custom + Bootstrap overrides
  js/app.js            # Minimal client-side (vanilla/Alpine)
  lib/                 # (or CDN for Bootstrap)

tests/
  setup.js             # Test DB, global before/after
  unit/
  integration/
  fixtures/seed.sql

docs/
  DECISIONS.md         # This decision log
  architecture/
  api/openapi.yaml
  database/
  security/
  operations/
  development/
  user-guide/

.env.example
package.json
eslint.config.js
README.md
AGENTS.md
```

## Common Commands

```bash
npm install              # deps
npm run db:migrate       # run migrations
npm run db:seed          # seed dev data
npm run dev              # nodemon server
npm test                 # test suite
npm run lint             # ESLint
```

## Gotchas (Updated)

- **Scan engine IS in v1** — host discovery → port scan → service detection → auto-create targets/services/findings
- **Client org assignment is M:N** via `engagement_organizations` — not direct FK on engagements
- **Findings link to targets AND services** via `finding_targets`, `finding_services` — app validates ≥1 link
- **Scans link to targets/services/findings** via `scan_targets`, `scan_services`, `scan_findings` — populated by scan engine
- **Triggers auto-populate `contributors`** on target/service/finding write — implement in DB, not app code
- **Scan status machine**: `READY → RUNNING → COMPLETED/FAILED/CANCELLED` (linear, no back-transitions)
- **Scans only runnable when engagement = ACTIVE** — enforced in middleware
- **Engagement scope** in `engagement_scope` table — validates scan targets against CIDR/ports
- **Audit logging** on all mutating actions — `audit_log` table
- **Multi-tenancy**: app-layer enforcement + integration tests (no MySQL RLS)

## Reference Files

- `README.md` — one-line project description
- `docs/DECISIONS.md` — complete decision log (25 items)
- `docs/api/openapi.yaml` — API contract (source of truth for routes)
- Git history of this file — original specification