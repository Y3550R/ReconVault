# ReconVault — Architecture Decisions Log

**Status**: All 25 items resolved (10 contradictions + 15 missing items). Ready for implementation.

---

## 1. Contradictions Fixed (C1–C10)

| ID | Issue | Decision |
|----|-------|----------|
| **C1** | FK typo: `contributors.scan_id` → `scan.scan_id` (table is `scans`) | Fix FK to reference `scans.scan_id` |
| **C2** | Overlapping roles, total specialization — no DB constraint for ≥1 role | App-layer enforcement only; validate on user create/update |
| **C3** | Scan status transitions undefined | Linear state machine: `READY → RUNNING → COMPLETED/FAILED/CANCELLED` (no back-transitions) |
| **C4** | Scan observes Target/Service (M:N), writes Finding (M:N) — no junction tables | Add `scan_targets`, `scan_services`, `scan_findings` junction tables |
| **C5** | Finding must link to ≥1 target OR service — not enforced | App-layer validation on finding create/update |
| **C6** | `clients.client_organization_id` nullable but Client implies org | Keep nullable; handle empty dashboard in app |
| **C7** | Engagement status vs Scan status coordination | Scans only runnable when engagement = `ACTIVE` |
| **C8** | Logical design has `Scan_Type`, physical omits it | Add `scan_type ENUM('HOST','PORT','SERVICE')` to `scans` |
| **C9** | `scans` has creator/runner/canceller but no assignee | `runner_user_id` = assignee (who performs scan) |
| **C10** | No `created_at`/`updated_at` on most tables | Add to key tables: `engagements`, `targets`, `services`, `findings`, `scans`, `users` |

---

## 2. Missing Items Resolved (M1–M15)

| ID | Issue | Decision |
|----|-------|----------|
| **M1** | No auth/session schema, no password reset | Server-side sessions: `express-session` + `express-mysql-session`; secure cookies (HttpOnly, Secure, SameSite=Strict) |
| **M2** | No API/route specification | OpenAPI 3.1 spec first (`docs/api/openapi.yaml`) |
| **M3** | Scan execution design underspecified | **v1 includes basic scan engine**: host discovery → port scan → service detection → auto-create targets/services/findings |
| **M4** | Finding evidence/PoC fields missing | Add to `findings`: `references TEXT`, `cvss_vector VARCHAR(100)`, `remediation TEXT` (no PoC — recon only) |
| **M5** | Discovery source tracking (manual vs nmap etc.) | Skip for v1 |
| **M6** | Engagement scope definition (CIDR, ports, exclusions) | Add `engagement_scope` table linked to engagement |
| **M7** | Reporting/Export for clients | Defer to post-v1 |
| **M8** | No audit/notification log | Add `audit_log` table: `user_id`, `action`, `entity_type`, `entity_id`, `metadata JSON`, `created_at` |
| **M9** | No migration tooling | `node-db-migrate` (SQL-based) |
| **M10** | No test DB/fixtures | Separate test DB + `seed.sql` + Jest |
| **M11** | No env/config module | `dotenv` + Joi validation |
| **M12** | No input validation rules | `express-validator` + shared `src/utils/validation.js` |
| **M13** | No pagination/filtering/sorting standard | Cursor pagination: `?page=1&limit=20&sort=created_at:desc&filter[status]=ACTIVE` |
| **M14** | Soft vs hard delete | Hard delete only |
| **M15** | Multi-tenancy isolation proof | App-layer enforcement + integration tests |

---

## 3. Schema Changes from Original Spec

### New Tables

```sql
-- engagement_scope: network scope for an engagement
CREATE TABLE engagement_scope (
    scope_id INT AUTO_INCREMENT PRIMARY KEY,
    engagement_id INT NOT NULL REFERENCES engagements(engagement_id),
    cidr_ranges JSON NOT NULL,           -- array of CIDR strings
    allowed_ports JSON,                  -- array of port numbers/ranges
    excluded_cidrs JSON,                 -- array of CIDR strings
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_engagement_scope (engagement_id)
);

-- scan_targets: which targets a scan observed
CREATE TABLE scan_targets (
    scan_id INT NOT NULL REFERENCES scans(scan_id) ON DELETE CASCADE,
    target_id INT NOT NULL REFERENCES targets(target_id) ON DELETE CASCADE,
    PRIMARY KEY (scan_id, target_id)
);

-- scan_services: which services a scan discovered
CREATE TABLE scan_services (
    scan_id INT NOT NULL REFERENCES scans(scan_id) ON DELETE CASCADE,
    service_id INT NOT NULL REFERENCES services(service_id) ON DELETE CASCADE,
    PRIMARY KEY (scan_id, service_id)
);

-- scan_findings: which findings a scan wrote up
CREATE TABLE scan_findings (
    scan_id INT NOT NULL REFERENCES scans(scan_id) ON DELETE CASCADE,
    finding_id INT NOT NULL REFERENCES findings(finding_id) ON DELETE CASCADE,
    PRIMARY KEY (scan_id, finding_id)
);

-- audit_log: immutable event stream
CREATE TABLE audit_log (
    log_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT REFERENCES users(user_id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,        -- e.g., 'target.created', 'scan.started'
    entity_type VARCHAR(50) NOT NULL,    -- 'target', 'service', 'finding', 'scan', 'engagement', 'user'
    entity_id INT NOT NULL,
    metadata JSON,                       -- flexible context
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_entity (entity_type, entity_id),
    INDEX idx_audit_user (user_id),
    INDEX idx_audit_created (created_at)
);
```

### Modified Tables

| Table | Changes |
|-------|---------|
| `contributors` | FK `scan_id` → `scans.scan_id` (was `scan.scan_id`) |
| `scans` | Add `scan_type ENUM('HOST','PORT','SERVICE') NOT NULL DEFAULT 'PORT'` |
| `engagements` | Add `created_at`, `updated_at` |
| `targets` | Add `created_at`, `updated_at` |
| `services` | Add `created_at`, `updated_at` |
| `findings` | Add `created_at`, `updated_at` + `references TEXT`, `cvss_vector VARCHAR(100)`, `remediation TEXT` |
| `scans` | Add `created_at` (exists), `updated_at` |
| `users` | Add `created_at`, `updated_at` |

### Updated Triggers

| Trigger | Logic |
|---------|-------|
| `AFTER INSERT/UPDATE ON targets` | Insert into `target_contributors` (type=PENTESTER, user_id=current_user) |
| `AFTER INSERT/UPDATE ON services` | Insert into `service_contributors` (type=PENTESTER, user_id=current_user) |
| `AFTER INSERT/UPDATE ON findings` | Insert into `finding_contributors` (type=PENTESTER, user_id=current_user) |
| `AFTER UPDATE ON scans` | If `status` → `COMPLETED`/`FAILED`/`CANCELLED`, set `finished_at = NOW()`; set `updated_at = NOW()` |
| `BEFORE INSERT ON scans` | Validate `engagement.status = 'ACTIVE'` if `status = 'RUNNING'` |
| `AFTER INSERT ON scan_targets/scan_services/scan_findings` | Insert into `contributors` (type=SCAN, scan_id=NEW.scan_id) + respective junction |

---

## 4. Updated Implementation Order

| Phase | Deliverable | Key Files |
|-------|-------------|-----------|
| **0** | Repo scaffolding | `package.json`, `.env.example`, `.gitignore`, `eslint.config.js`, folder structure |
| **1** | Database schema (all tables) | `database/schema.sql` |
| **2** | Triggers, procedures, scope | `database/triggers.sql`, `database/procedures.sql` |
| **3** | Migrations (`node-db-migrate`) | `database/migrations/001_init.sql` |
| **4** | Config, DB connection, OpenAPI spec | `src/config/`, `docs/api/openapi.yaml` |
| **5** | Auth (sessions, Argon2id, login/logout) | `src/middleware/auth.js`, `src/routes/auth.js` |
| **6** | RBAC + engagement access middleware | `src/middleware/rbac.js`, `src/middleware/engagementAccess.js` |
| **7** | Admin pages (users, orgs, engagements, team) | `src/routes/users.js`, `src/routes/organizations.js`, `src/routes/engagements.js`, `src/routes/engagementTeam.js` |
| **8** | Targets & Services (+ contributor triggers) | `src/routes/targets.js`, `src/routes/services.js` |
| **9** | Findings (with new fields) | `src/routes/findings.js` |
| **10** | Scan Management (CRUD + status machine) | `src/routes/scans.js` |
| **11** | **Scan Engine** (host discovery → port scan → service detection → auto-create) | `src/services/scanEngine.js`, `src/workers/scanWorker.js` |
| **12** | Client read-only views | `src/routes/client/*.js` |
| **13** | UI polish + Bootstrap | `src/views/`, `public/` |
| **14** | Tests + CI | `tests/`, `.github/workflows/ci.yml` |
| **15** | Docs + hardening | `docs/`, helmet, rate-limit, backup script |

---

## 5. Key Technical Choices

| Area | Choice |
|------|--------|
| **Runtime** | Node.js 20+ (LTS) |
| **Framework** | Express 4.x |
| **Database** | MySQL 8.0+ (mysql2/promise) |
| **Sessions** | express-session + express-mysql-session |
| **Password Hash** | argon2 (Argon2id, memory=64MB, iterations=3, parallelism=4) |
| **Validation** | express-validator + shared validators |
| **Templating** | EJS (server-rendered) |
| **CSS/JS** | Bootstrap 5 (CDN) + minimal custom |
| **Scan Engine** | Custom Node.js (net-ping, port scanning, service detection) |
| **Queue** | BullMQ + Redis (for scan jobs) |
| **Testing** | Jest + Supertest + separate test DB |
| **Linting** | ESLint (flat config) |
| **Migrations** | node-db-migrate |
| **API Docs** | OpenAPI 3.1 (YAML) + Swagger UI |

---

## 6. Open Questions for Implementation

None — all resolved. Proceed to Phase 0.

---

*Generated from requirements review session. Source: AGENTS.md (original spec) + 25 decision points.*