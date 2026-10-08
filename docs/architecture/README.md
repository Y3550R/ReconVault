# Architecture Documentation

## Overview
ReconVault is an offensive security reconnaissance asset manager prototype built with Node.js, Express, and MariaDB. It provides a web interface for managing security engagements, targets, services, findings, and scans.

## Tech Stack
- **Runtime**: Node.js (>=20.0.0)
- **Framework**: Express.js 4.19.2
- **Database**: MariaDB 13.0.2 (port 3315)
- **ORM/Query Builder**: Raw SQL via mysql2 promise
- **Authentication**: express-session with MySQL session storage
- **Password Hashing**: Argon2 (id variant)
- **Validation**: Custom validation utils with enum checking and sanitization
- **Network Scanning**: nmap binary (path configured via NMAP_PATH env var)
- **HTTP Client**: Standard express routes

## Directory Structure
```
src/
├── app.js              # Express app setup, session, middleware, routes
├── db.js               # Database pool creation, helpers (query, execute, paginate, etc.)
├── config/index.js     # Environment variable loading and validation
├── controllers/        # Route controllers (CRUD operations, business logic)
│   ├── adminUserController.js
│   ├── authController.js
│   ├── engagementController.js
│   ├── findingController.js
│   ├── scanController.js
│   ├── serviceController.js
│   └── targetController.js
├── middleware/         # Express middleware (auth, error handling, asyncHandler)
│   ├── auth.js
│   └── errorHandler.js
├── routes/             # Express routers grouped by feature
│   ├── auth.js
│   ├── engagements.js
│   ├── engagementNested.js   # Nested: targets, services, findings, scans
│   ├── admin/
│   │   ├── users.js
│   │   └── organizations.js
│   ├── findings.js
│   ├── services.js
│   ├── scans.js
│   └── targets.js
├── services/           # Business logic services
│   └── password.js   # Argon2 hash/verify/needsRehash
└── utils/              # Utility functions (validation, parsing)
    └── validation.js
```

## Key Architectural Patterns

### 1. Session-Based Authentication
- Sessions stored in MySQL database via `express-mysql-session`
- Login creates a session; subsequent requests use the session cookie
- `authMiddleware` attaches user and loads roles on each request

### 2. Role-Based Access Control (RBAC)
Three overlapping roles can be assigned to a single user:
- **Admin**: Full access to all entities and admin operations
- **Pentester**: Can create/manage targets, services, findings, scans within engagements they're assigned to
- **Client**: Can view engagements associated with their client organization

Roles are determined at login by checking `administrators`, `pentesters`, and `clients` tables.

### 3. Engagement-Nested Resources
Most resources are nested under engagements:
- `engagement_id` is required for targets, services, findings, and scans
- Engagement access is checked via `requireEngagementAccess` middleware
- Clients access engagements through `engagement_organizations` links

### 4. Trigger-Driven Contributor Tracking
Database triggers automatically record contributors when targets, services, or findings are created/updated:
- Requires `@current_user_id` session variable to be set by the app before writes
- Records PENTESTER contributors in the polymorphic `contributors` table
- Links contributors to their respective entities via junction tables

### 5. Scan State Machine
Scans follow a linear state machine:
```
READY → RUNNING → COMPLETED/FAILED/CANCELLED
```
- Scans can only be started from `READY` status
- Engagement must be `ACTIVE` to start scans
- Cannot delete a running scan; must cancel first

### 6. Polymorphic Contributors Table
The `contributors` table uses a polymorphic pattern:
- `contributor_type`: Either `SCAN` or `PENTESTER`
- If `PENTESTER`: `user_id` is required, `scan_id` is nullable
- If `SCAN`: `scan_id` is required, `user_id` is nullable
- Enforced at application level (CHECK constraints not supported in MariaDB 13)

### 7. Database-First Schema
- Schema defined in `database/schema.sql` (19 tables, 7 triggers, 28 foreign keys)
- Application code reflects the schema structure
- No migration tool — schema changes applied manually to `schema.sql`

## API Design
- RESTful endpoints under `/api`
- Resource nesting reflects database hierarchy
- Authentication via session cookie
- Role-based access control at the middleware level
- Error responses use standardized `error` object with `code` and `message`

## Deployment
- MariaDB runs on isolated port 3315
- Node app runs on configured port (default 3000)
- Environment variables via `.env` file (never committed)
- Startup script `runServer_test.sh` handles DB initialization and app startup
