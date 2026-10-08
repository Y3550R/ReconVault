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

## Services (nested under target → engagement)
`GET/POST/GET/PUT/DELETE /api/engagements/:engagementId/targets/:targetId/services[/:serviceId]`
- **Auth required**: Pentester or higher
- **Create**: Requires `name`, `port`; optional `protocol`, `version`, `state`

## Findings (nested under engagement)
`GET/POST/GET/PUT/DELETE /api/engagements/:engagementId/findings[/:findingId]`
- **Auth required**: Pentester or higher
- **Create**: Requires `title`, `description`, `severity`; optional `status`, `target_ids[]`, `service_ids[]`, `references`, `cvss_vector`, `remediation`
- **Update**: Can replace target/service links

## Scans (nested under engagement)
`GET/POST/GET/PUT/DELETE /api/engagements/:engagementId/scans[/:scanId]`
- **Auth required**: Pentester or higher
- **Create**: Requires `scan_type` ("HOST" or "PORT"), starts at `READY` status
- `POST /api/engagements/:engagementId/scans/:scanId/start` — Start scan (engagement must be `ACTIVE`)
- `POST /api/engagements/:engagementId/scans/:scanId/cancel` — Cancel running scan

## Admin Users
`GET/POST/GET/PUT/DELETE /api/admin/users`
- **Auth required**: Admin
- **Endpoints**: listUsers, createUser, getUser, updateUser, deleteUser
- **Roles management**: `GET /:userId/roles`, `POST /:userId/roles`, `DELETE /:userId/roles`
- **Organization**: `GET /:userId/organization`, `PUT /:userId/organization`

## Admin Organizations
`GET/POST/GET/PUT/DELETE /api/admin/organizations`
- **Auth required**: Admin
- **Endpoints**: listOrganizations, createOrganization, getOrganization, updateOrganization, deleteOrganization
- **Engagement organization links**: `GET/POST/DELETE /engagements/:engagementId` (link/disassociate org from engagement)
