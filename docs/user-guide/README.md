# User Guide

## Introduction
ReconVault is a reconnaissance asset manager for offensive security teams. It helps manage security engagements, track targets and services, document findings, and coordinate scan operations.

## Getting Started

### Logging In
1. Navigate to the application URL (default: `http://127.0.0.1:3000`)
2. Click "Login" or go to `/api/auth/login`
3. Enter your username and password
4. Upon successful login, you'll be redirected or see a success response

### User Roles
Depending on your assigned role, you'll have different capabilities:

| Role | Capabilities |
|------|-------------|
| **Admin** | Full access: manage users, organizations, engagements, all CRUD operations |
| **Pentester** | Create/manage targets, services, findings, scans within assigned engagements |
| **Client** | View engagements associated with their organization, limited access |
| **Anonymous** | Public endpoints only (login, me) |

## Navigation

### Main Sections
- **Engagements**: Manage security engagement projects
- **Targets**: Add and track target systems/IPs per engagement
- **Services**: Document services running on targets
- **Findings**: Record security vulnerabilities and issues
- **Scans**: Manage and track network scans
- **Users**: Administration (admin only)
- **Organizations**: Client organization management (admin only)

## Working with Engagements

### Creating an Engagement
1. Go to Engagements → Click "New Engagement" (or `POST /api/engagements`)
2. Fill in:
   - **Name**: Engagement name (required)
   - **Description**: Optional description
   - **Start Date**: Engagement start date (YYYY-MM-DD, required)
   - **End Date**: Engagement end date (optional)
   - **Status**: PLANNED | ACTIVE | COMPLETED | CANCELLED (default: PLANNED)
3. Click "Create"

### Engagement Status
- **PLANNED**: Initial state, no scans can run
- **ACTIVE**: Engagement in progress, scans can be run
- **COMPLETED**: Engagement finished
- **CANCELLED**: Engagement cancelled

### Assigning Pentesters
- Admin can add members via `POST /api/engagements/:engagementId/members`
- Enter `user_id` of the pentester to assign
- Members can then create targets, services, findings, and scans

## Working with Targets

### Creating a Target
1. Go to an Engagement → Targets → "New Target"
2. Required fields:
   - **IP Type**: IPV4 or IPV6
   - **IP Address**: The target's IP address (required)
3. Optional fields:
   - **Domain Name**: Associated domain
   - **Hostname**: Hostname
   - **Description**: Free-text description
   - **Status**: ACTIVE or INACTIVE (default: ACTIVE)
   - **Operating System**: OS description

### Target IP Validation
- IP addresses are validated on creation
- Must match the selected IP type (IPV4/IPV6)
- Format: `xxx.xxx.xxx.xxx` for IPv4, `xxxx:xxxx:...` for IPv6

## Working with Services

### Creating a Service
1. Navigate to a Target's services → "New Service"
2. Required fields:
   - **Name**: Service name (e.g., "http", "ssh")
   - **Port**: Port number (1-65535)
3. Optional fields:
   - **Protocol**: TCP, UDP, SCTP, ICMP (default: TCP)
   - **Version**: Service version
   - **State**: UNKNOWN, OPEN, CLOSED, FILTERED (default: UNKNOWN)

## Working with Findings

### Creating a Finding
1. Go to an Engagement → Findings → "New Finding"
2. Required fields:
   - **Title**: Finding title (required)
   - **Description**: Detailed description (required)
   - **Severity**: CRITICAL | HIGH | MEDIUM | LOW | INFO (required)
3. Optional fields:
   - **Status**: OPEN | IN PROGRESS | RESOLVED | ACCEPTED (default: OPEN)
   - **References**: Additional references or URLs
   - **CVSS Vector**: CVSS vector string
   - **Remediation**: Remediation steps
4. Associate targets and/or services:
   - Select from existing targets/services in the engagement
   - Or add new targets/services first, then link them

### Finding Severity Scale
- **CRITICAL**: Immediate action required, severe impact
- **HIGH**: Significant risk, likely exploitability
- **MEDIUM**: Moderate risk, certain conditions required
- **LOW**: Low risk, difficult to exploit
- **INFO**: Informational, no immediate action needed

### Severity Ordering
Findings are sorted by severity in lists (CRITICAL first, INFO last), then by discovery date (newest first).

## Working with Scans

### Creating a Scan
1. Go to an Engagement → Scans → "New Scan"
2. Required field:
   - **Scan Type**: HOST or PORT (determines scan methodology)
3. Scan starts at `READY` status

### Scan State Machine
Scans progress through these states:
```
READY → RUNNING → COMPLETED/FAILED/CANCELLED
```

### Scan Operations
- **Start**: Moves scan from READY → RUNNING (engagement must be ACTIVE)
- **Cancel**: Moves RUNNING → CANCELLED (cannot delete a running scan)
- **View**: Check scan status and details

### Scan Restrictions
- Engagement must be in ACTIVE status to start scans
- Only pentesters (or admins) can start/cancel scans
- Cannot delete a scan in RUNNING status

## Filtering and Sorting

### Engagement Filters
- Available to all authenticated users
- Filters by role-based access:
  - Admins: See all engagements
  - Pentesters: See engagements they're members of
  - Clients: See engagements their organization is linked to

### Finding Filters
- Sort by severity (CRITICAL → HIGH → MEDIUM → LOW → INFO)
- Sort by discovery date
- Filter by status (OPEN, IN PROGRESS, RESOLVED, ACCEPTED)

### Client-Side Viewing
- Clients see only engagements associated with their organization
- Pentesters see only their assigned engagements
- Admins see all engagements

## Keyboard Shortcuts
*(No specific shortcuts defined in prototype — use the web interface or API)*

## API Usage
For programmatic access, the API follows REST conventions:

### Base URL
```
http://127.0.0.1:3000/api
```

### Authentication
- Use session cookie `reconvault.sid` set during login
- Include in request headers or as cookie

### Common Endpoints
- `POST /api/auth/login` — Authenticate
- `GET /api/auth/me` — Get current user
- `GET /api/engagements` — List engagements (role-filtered)
- `POST /api/engagements` — Create engagement (admin)
- `GET /api/engagements/:id/targets` — List targets
- `POST /api/engagements/:id/targets` — Create target
- `GET /api/engagements/:id/findings` — List findings
- `POST /api/engagements/:id/findings` — Create finding
- `GET /api/engagements/:id/scans` — List scans
- `POST /api/engagements/:id/scans` — Create scan

### Response Format
Successful responses typically: `{ success: true, data: [...] }` or `{ success: true, data: {...} }`
Error responses: `{ error: { code: "ERROR_CODE", message: "..." } }`

## Troubleshooting

### Common Issues

**"Authentication required" (401)**
- Not logged in or session expired
- Login again or refresh the page

**"Not a member of this engagement" (403)**
- You're trying to access an engagement you aren't assigned to
- Ask an admin to add you as a member

**"Engagement must be ACTIVE to start scans" (400)**
- The engagement status is not ACTIVE
- Admin needs to change engagement status

**"Invalid IP address" (400)**
- IP format doesn't match the selected IP type
- Verify IPV4/IPV6 format

**"Scan can only be started from READY status" (400)**
- Scan is not in READY state
- Check current scan status or create a new scan

### Database Issues
- Ensure MariaDB is running on port 3315
- Verify `.env` configuration matches database settings
- Check application logs for detailed error messages

## Getting Help
- Check the application logs for detailed error information
- Consult the documentation in the `docs/` directory
- Review the test suite results with `npm test`
