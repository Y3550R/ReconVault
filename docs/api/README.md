# API Documentation

## Base URL
`http://127.0.0.1:3000/api`
Hostname and port is editable

## Authentication
Most endpoints require authentication. Include the session cookie `reconvault.sid` in requests.

### Login
`POST /api/auth/login`
- **Auth required**: No
- **Request body**: `{ "username": "string", "password": "string" }`
- **Response**: `{ success: true, user: { user_id, username, roles } }`

### Me
`GET /api/auth/me`
- **Auth required**: Yes (session cookie)
- **Response**: `{ user: { user_id, username, roles, clientOrganizationId } }`

### Logout
`POST /api/auth/logout`
- **Auth required**: Yes (session cookie)

## Engagements
All engagement endpoints require authentication and engagement access.

### List Engagements
`GET /api/engagements`
- **Auth required**: Yes
- **Query params**: None specific
- **Response**: `{ engagements: [...] }`

### Create Engagement
`POST /api/engagements`
- **Auth required**: Admin
- **Request body**: `{ "name": "string", "description": "string", "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD", "status": "PLANNED|ACTIVE|COMPLETED|CANCELLED" }`
- **Response**: `{ engagement: { engagement_id, ... } }`, status 201

### Get Engagement
`GET /api/engagements/:engagementId`
- **Auth required**: Yes
- **Response**: `{ engagement: { ... } }`

### Update Engagement
`PUT /api/engagements/:engagementId`
- **Auth required**: Admin
- **Request body**: Partial engagement fields

### Delete Engagement
`DELETE /api/engagements/:engagementId`
- **Auth required**: Admin

### Member Management
- `POST /api/engagements/:engagementId/members` — Admin only, add user by `user_id`
- `DELETE /api/engagements/:engagementId/members/:userId` — Admin only, remove member

## Targets (nested under engagement)
`GET/POST/GET/PUT/DELETE /api/engagements/:engagementId/targets[/:targetId]`
- **Auth required**: Pentester or higher
- **Create**: Requires `ip_type`, `ip_address`; optional `domain_name`, `hostname`, `description`, `status`, `operating_system`
- **Response includes**: Each target has a `contributors` array with `{ contributor_type, user_id, username, scan_id, scan_type, scan_status }` entries. Pentester entries carry `username`; scan entries carry the scan metadata. Duplicate rows from trigger writes are collapsed.

## Services (nested under target → engagement)
`GET/POST/GET/PUT/DELETE /api/engagements/:engagementId/targets/:targetId/services[/:serviceId]`
- **Auth required**: Pentester or higher
- **Create**: Requires `name`, `port`; optional `protocol`, `version`, `state`
- **Response includes**: Each service has the same `contributors` array described for targets.

## Findings (nested under engagement)
`GET/POST/GET/PUT/DELETE /api/engagements/:engagementId/findings[/:findingId]`
- **Auth required**: Pentester or higher
- **Create**: Requires `title`, `description`, `severity`; optional `status`, `target_ids[]`, `service_ids[]`, `references`, `cvss_vector`, `remediation`
- **Update**: Can replace target/service links
- **Response includes**: Each finding has the same `contributors` array described for targets. Finding details also return `targets` and `services` with their own contributors.
- `GET /api/engagements/:engagementId/findings/open` — List OPEN / IN PROGRESS findings. Optional `?severity=CRITICAL|HIGH|MEDIUM|LOW|INFO` filter.

## Scans (nested under engagement)
`GET/POST/GET/PATCH /api/engagements/:engagementId/scans[/:scanId]`
- **Auth required**: Pentester or higher
- **Create**: Requires `scan_type` ("HOST" or "PORT"), optional `description`
  - **HOST scan**: Requires `hosts` array with objects `{ "ip_type": "IPV4|IPV6", "ip_address_or_cidr": "string" }`
  - **PORT scan**: Requires `target_ip_type` ("IPV4" or "IPV6"), `target_ip_address` (string), and `ports` array with objects `{ "port_start": int, "port_end": int, "protocol": "TCP|UDP|SCTP|ICMP" }`
  - Starts at `READY` status
- **Update** (`PATCH /:scanId`): Only allowed while scan is `READY`. Can update `scan_type`, `description`, `hosts`, `ports`, `target_ip_type`, `target_ip_address`
- `POST /api/engagements/:engagementId/scans/:scanId/start` — Start scan (engagement must be `ACTIVE`, scan must be `READY` with valid config). Starts nmap asynchronously and returns immediately with the scan in `RUNNING` status.
- `POST /api/engagements/:engagementId/scans/:scanId/cancel` — Cancel running scan
- `GET /api/engagements/:engagementId/scans/:scanId/output` — Fetch the human-readable nmap output for a scan. For a currently running scan this returns the live in-memory buffer.
- **Live updates**: Connect to `ws(s)://<host>/ws/scans?engagementId=:engagementId`. The server sends `scan.output` chunks, `scan.status` events, and `scans.changed` events for that engagement.
- **Response includes**: `hosts` (from scan_hosts), `ports` (from scan_ports), `error_message`, `runner_pid`, `started_at`, `finished_at`. `nmap_output` is available from the dedicated output endpoint.
- **Scan state machine**: `READY` → `RUNNING` → `COMPLETED` | `FAILED` | `CANCELLED`
- **Nmap verbosity**: Scans run with `-v` and `--stats-every 5s`; nmap console output is streamed live and persisted as `nmap_output` on completion.
- **Concurrency limit**: Configurable via `MAX_CONCURRENT_SCANS` (default 3)
- **Timeout**: Configurable via `SCAN_TIMEOUT_MS` (default 30 min), marks scan `FAILED` with partial results if exceeded

## Admin Users
`GET/POST/GET/PUT /api/admin/users` + `/:userId`
- **Auth required**: Admin
- **Endpoints**: listUsers, createUser, getUser, updateUser
- **Create & Update**: Requires (Optional if update) `username`, `password`, `status`, `roles`
- **Roles management**: `GET /:userId/roles`, `POST /:userId/roles`, `DELETE /:userId/roles`
- **Roles POST/DELETE**: Requires `role`
- **Organization**: `GET /:userId/organization`, `PUT /:userId/organization`
- **Organization PUT**: Requires `client_organization_id`

## Admin Organizations
`GET/POST/GET/PUT /api/admin/organizations` + `/:organizationId`
- **Auth required**: Admin
- **Endpoints**: listOrganizations, createOrganization, getOrganization, updateOrganization
- **Create & Update**: Requires (Optional if update) `name`, `contact_information`
