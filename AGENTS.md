# ReconVault - Agent Implementation Guide

**Status**: Greenfield project — only specification exists. Implementation starts from scratch.

## Quick Reference

| Layer | Technology | Notes |
|-------|------------|-------|
| Frontend | HTML/CSS/JS + Bootstrap | Server-rendered pages, minimal JS |
| Backend | Node.js + Express | REST-ish endpoints, session auth |
| Database | MySQL 8 | Exact schema defined in spec |

## Specification Source

The detailed requirements live in this file's previous version (see git history). It defines:
- 3 roles: **Administrator**, **Pentester**, **Client** (overlapping subclasses of User)
- 11 UI pages with CRUD mappings
- 15 MySQL tables with exact columns, enums, FKs
- 6 stored procedures, 4 triggers
- Security standards: Argon2id, RBAC, parameterized queries, HTTPS

## Implementation Priorities

1. **Database first** — create schema + triggers + procedures in `database/`
2. **Auth & session** — login, Argon2id verify, role middleware
3. **Admin pages** — user/org/engagement management (Pages 2, 4, 10, 11)
4. **Pentester pages** — targets, services, findings, scans (Pages 5–9)
5. **Client pages** — read-only engagement views (Pages 3, 5–8)

## Conventions to Follow

- **Parameterized queries only** — no string interpolation in SQL
- **Server-side authorization** on every route — check role + engagement access
- **Status enums** exactly as specified (e.g., `ENGAGEMENT_STATUS`: PLANNED/ACTIVE/COMPLETED/CANCELLED)
- **Contributor tracking** via `contributors` polymorphic table (SCAN or PENTESTER)
- **Session cookie**: `HttpOnly`, `Secure`, `SameSite=Strict`

## Directory Structure (planned)

```
database/      # .sql schema, triggers, procedures
src/
  routes/      # Express routers per page/domain
  middleware/  # auth, rbac, validation
  services/    # business logic, DB queries
  views/       # server-rendered HTML (ejs or similar)
public/        # static assets (Bootstrap, custom CSS/JS)
tests/         # integration tests against test DB
```

## Common Commands (when implemented)

```bash
npm install          # deps
npm run db:init      # run schema + seed
npm run dev          # nodemon server
npm test             # test suite
```

## Gotchas to Avoid

- Don't implement scan execution engine yet — spec only covers scan *management* (CRUD + status transitions)
- Client org assignment is M:N via `engagement_organizations` — not a direct FK on engagements
- Findings link to targets AND services via junction tables (`finding_targets`, `finding_services`)
- Triggers auto-populate `contributors` on target/service/finding write — implement in DB, not app code

## Reference Files

- `README.md` — one-line project description
- Git history of this file — full specification (roles, flows, schema, procedures, triggers, security)