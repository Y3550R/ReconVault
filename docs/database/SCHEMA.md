# Database Schema Reference

> **Source of truth**: `database/schema.sql` — canonical DDL

---

## Tables (19)

### Users & Roles (Overlapping Subclasses)

| Table | Columns | Constraints |
|-------|---------|-------------|
| `users` | `user_id` (PK, AI), `username` (UQ), `password_hash`, `status` (ACTIVE/INACTIVE), `created_at`, `updated_at` | |
| `administrators` | `user_id` (PK, FK→users) | CASCADE |
| `pentesters` | `user_id` (PK, FK→users) | CASCADE |
| `client_organizations` | `organization_id` (PK, AI), `name`, `contact_information`, `created_at`, `updated_at` | |
| `clients` | `user_id` (PK, FK→users), `client_organization_id` (FK→client_organizations) | CASCADE / SET NULL |

### Engagements & Assignments

| Table | Columns | Constraints |
|-------|---------|-------------|
| `engagements` | `engagement_id` (PK, AI), `name`, `description`, `start_date`, `end_date`, `status` (PLANNED/ACTIVE/COMPLETED/CANCELLED), `created_at`, `updated_at` | |
| `engagement_members` | `engagement_id` (FK), `user_id` (FK) | Composite PK, CASCADE |
| `engagement_organizations` | `engagement_id` (FK), `organization_id` (FK) | Composite PK, CASCADE |

### Targets & Services

| Table | Columns | Constraints |
|-------|---------|-------------|
| `targets` | `target_id` (PK, AI), `engagement_id` (FK), `ip_type` (IPV4/IPV6), `ip_address`, `domain_name`, `hostname`, `description`, `status` (ACTIVE/INACTIVE), `operating_system`, `created_at`, `updated_at` | CASCADE (engagement), indexes on engagement_id, ip_address |
| `services` | `service_id` (PK, AI), `target_id` (FK), `name`, `port`, `protocol` (default TCP), `version`, `state` (UNKNOWN/OPEN/CLOSED/FILTERED), `created_at`, `updated_at` | CASCADE (target), indexes on target_id, port |

### Findings

| Table | Columns | Constraints |
|-------|---------|-------------|
| `findings` | `finding_id` (PK, AI), `engagement_id` (FK), `title`, `description`, `severity` (CRITICAL/HIGH/MEDIUM/LOW/INFO), `status` (OPEN/IN PROGRESS/RESOLVED/ACCEPTED), `discovered_at`, `resolved_at`, `creator_user_id` (FK), `references`, `cvss_vector`, `remediation`, `created_at`, `updated_at` | CASCADE (engagement), RESTRICT (creator), indexes on engagement_id, severity, status |
| `finding_targets` | `finding_id` (FK), `target_id` (FK) | Composite PK, CASCADE |
| `finding_services` | `finding_id` (FK), `service_id` (FK) | Composite PK, CASCADE |

### Contributors (Polymorphic)

| Table | Columns | Constraints |
|-------|---------|-------------|
| `contributors` | `contributor_id` (PK, AI), `contributor_type` (SCAN/PENTESTER), `user_id` (FK, nullable), `scan_id` (FK, nullable), `created_at` | SET NULL (user, scan), indexes on type+user, type+scan |
| `target_contributors` | `contributor_id` (FK), `target_id` (FK) | Composite PK, CASCADE |
| `service_contributors` | `contributor_id` (FK), `service_id` (FK) | Composite PK, CASCADE |
| `finding_contributors` | `contributor_id` (FK), `finding_id` (FK) | Composite PK, CASCADE |

### Scans

| Table | Columns | Constraints |
|-------|---------|-------------|
| `scans` | `scan_id` (PK, AI), `engagement_id` (FK), `creator_user_id` (FK), `runner_user_id` (FK, nullable), `canceller_user_id` (FK, nullable), `scan_type` (HOST/PORT), `status` (READY/RUNNING/COMPLETED/FAILED/CANCELLED), `created_at`, `started_at`, `finished_at`, `updated_at` | CASCADE (engagement), RESTRICT (creator), SET NULL (runner, canceller), indexes on engagement_id, status |

### Sessions

| Table | Columns | Constraints |
|-------|---------|-------------|
| `sessions` | `session_id` (PK, varchar 128), `expires` (int unsigned), `data` (mediumtext) | Binary collation |

---

## Triggers (7)

| Trigger | Table | Timing | Event | Action |
|---------|-------|--------|-------|--------|
| `trg_target_after_insert` | targets | AFTER | INSERT | Insert PENTESTER contributor + target_contributors link |
| `trg_target_after_update` | targets | AFTER | UPDATE | Insert PENTESTER contributor + target_contributors link |
| `trg_service_after_insert` | services | AFTER | INSERT | Insert PENTESTER contributor + service_contributors link |
| `trg_service_after_update` | services | AFTER | UPDATE | Insert PENTESTER contributor + service_contributors link |
| `trg_finding_after_insert` | findings | AFTER | INSERT | Insert PENTESTER contributor + finding_contributors link |
| `trg_finding_after_update` | findings | AFTER | UPDATE | Insert PENTESTER contributor + finding_contributors link |
| `trg_scan_before_update` | scans | BEFORE | UPDATE | Set `finished_at = NOW()` on status → COMPLETED/FAILED/CANCELLED |

**Usage**: App must set `@current_user_id` before writes:
```sql
SET @current_user_id = <user_id>;
```

---

## Foreign Keys (28)

| Child Table | Column | Parent Table | On Delete | On Update |
|-------------|--------|--------------|-----------|-----------|
| administrators | user_id | users | CASCADE | CASCADE |
| pentesters | user_id | users | CASCADE | CASCADE |
| clients | user_id | users | CASCADE | CASCADE |
| clients | client_organization_id | client_organizations | SET NULL | CASCADE |
| engagement_members | engagement_id | engagements | CASCADE | CASCADE |
| engagement_members | user_id | users | CASCADE | CASCADE |
| engagement_organizations | engagement_id | engagements | CASCADE | CASCADE |
| engagement_organizations | organization_id | client_organizations | CASCADE | CASCADE |
| targets | engagement_id | engagements | CASCADE | CASCADE |
| services | target_id | targets | CASCADE | CASCADE |
| findings | engagement_id | engagements | CASCADE | CASCADE |
| findings | creator_user_id | users | RESTRICT | CASCADE |
| finding_targets | finding_id | findings | CASCADE | CASCADE |
| finding_targets | target_id | targets | CASCADE | CASCADE |
| finding_services | finding_id | findings | CASCADE | CASCADE |
| finding_services | service_id | services | CASCADE | CASCADE |
| contributors | user_id | users | SET NULL | CASCADE |
| contributors | scan_id | scans | SET NULL | CASCADE |
| target_contributors | contributor_id | contributors | CASCADE | CASCADE |
| target_contributors | target_id | targets | CASCADE | CASCADE |
| service_contributors | contributor_id | contributors | CASCADE | CASCADE |
| service_contributors | service_id | services | CASCADE | CASCADE |
| finding_contributors | contributor_id | contributors | CASCADE | CASCADE |
| finding_contributors | finding_id | findings | CASCADE | CASCADE |
| scans | engagement_id | engagements | CASCADE | CASCADE |
| scans | creator_user_id | users | RESTRICT | CASCADE |
| scans | runner_user_id | users | SET NULL | CASCADE |
| scans | canceller_user_id | users | SET NULL | CASCADE |

---

## Indexes

| Table | Index | Columns |
|-------|-------|---------|
| users | PRIMARY | user_id |
| users | UNIQUE | username |
| targets | idx_targets_engagement | engagement_id |
| targets | idx_targets_ip | ip_address |
| services | idx_services_target | target_id |
| services | idx_services_port | port |
| findings | idx_findings_engagement | engagement_id |
| findings | idx_findings_severity | severity |
| findings | idx_findings_status | status |
| contributors | idx_contributors_type_user | contributor_type, user_id |
| contributors | idx_contributors_type_scan | contributor_type, scan_id |
| scans | idx_scans_engagement | engagement_id |
| scans | idx_scans_status | status |

---

## Status Enums

| Table | Column | Values |
|-------|--------|--------|
| users | status | ACTIVE, INACTIVE |
| engagements | status | PLANNED, ACTIVE, COMPLETED, CANCELLED |
| targets | status | ACTIVE, INACTIVE |
| services | state | UNKNOWN, OPEN, CLOSED, FILTERED |
| findings | severity | CRITICAL, HIGH, MEDIUM, LOW, INFO |
| findings | status | OPEN, IN PROGRESS, RESOLVED, ACCEPTED |
| scans | scan_type | HOST, PORT |
| scans | status | READY, RUNNING, COMPLETED, FAILED, CANCELLED |
| contributors | contributor_type | SCAN, PENTESTER |

---

## Polymorphic Contributors

The `contributors` table uses a polymorphic pattern:

| contributor_type | Required | Nullable |
|------------------|----------|----------|
| PENTESTER | user_id | scan_id |
| SCAN | scan_id | user_id |

Enforced at application level (CHECK constraint not supported in MariaDB 13).

---

## Junction Tables

| Table | Links | Purpose |
|-------|-------|---------|
| engagement_members | users ↔ engagements | Pentester assignments |
| engagement_organizations | client_organizations ↔ engagements | Client access |
| finding_targets | findings ↔ targets | Affected hosts |
| finding_services | findings ↔ services | Affected services |
| target_contributors | contributors ↔ targets | Who created target |
| service_contributors | contributors ↔ services | Who created service |
| finding_contributors | contributors ↔ findings | Who created finding |

---

## Notes

- **Stored procedures**: Not implemented (MariaDB 13 system table limitation)
- **CHECK constraints**: Not enforced in MariaDB 13 for polymorphic contributor validation
- **Trigger dependency**: Requires `@current_user_id` session variable set by app
- **Hard delete only**: No soft delete columns
- **Timestamps**: All core tables have `created_at`, `updated_at` (auto on update)