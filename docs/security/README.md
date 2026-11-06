# Security Documentation

## Security Conventions

### 1. Dedicated Database User
- Application connects as web user (not root)
- `.env` contains `DB_WEB_USER=webuser` and `DB_WEB_PASS`
- Password stored in environment, never in code
- User has specific grants on `DB_NAME` database only

### 2. No Secret Fallbacks
- Code validates 7 required env vars at startup and throws if missing
- No default values for secrets (SESSION_SECRET, DB passwords)
- Optional vars have sensible defaults only

### 3. Session Security
- Session cookies stored in MySQL database via `express-mysql-session`
- Cookie name: `reconvault.sid` (configurable via `SESSION_NAME`)
- `httpOnly: true` — accessible only by HTTP responses
- `sameSite: "strict"` — prevents CSRF from other sites
- `secure: false` by default (set `SESSION_SECURE=true` whenever TLS is enabled)
- Session expiry: `SESSION_MAX_AGE` default 24 hours (86400000 ms)

### 4. Prepared Statements Only
- All queries use parameterized queries via `pool.execute(sql, params)`
- Never concatenate user input directly into SQL
- `query()` and `execute()` helpers in `db.js` handle parameter binding

### 5. Session Variable for Triggers
- Database triggers for contributor tracking require the `@current_user_id` session variable
- Application must set it on the **same connection** that performs the INSERT/UPDATE on:
  - `targets` table
  - `services` table
  - `findings` table
- Request handlers do this inside `db.transaction()` with `SET @current_user_id = ?` and reset it to `NULL` before the connection is released
- Forgetting this will result in contributor records not being created

### 6. Hard Delete Only
- No soft delete columns (no `is_deleted`, `deleted_at` fields)
- DELETE operations permanently remove records
- Cascade deletes enforced via foreign keys

### 7. Input Validation
- All user input validated before database operations
- Enum values checked against allowed lists
- Strings sanitized via `sanitizeString()` (trim + truncate)
- IP addresses, ports, and CIDR ranges validated
- Minimum password length: 12 characters

### 8. Authentication & Authorization
- Login validates credentials against ACTIVE users only
- Passwords hashed with Argon2 (id variant)
- Session-based auth; no stateless token validation in prototype
- Role-based access control at middleware level
- Four access levels: anon, client, pentester, admin

### 9. Environment Isolation
- MariaDB runs on isolated port 3315
- All operations should use port 3315
- Never expose MariaDB root or other ports publicly
- Development and production should use separate `.env` files

### 10. Error Handling
- Operational errors return appropriate status codes (400, 401, 403, 404, 409, 500)
- Error messages don't leak sensitive information in production
- Stack traces only visible in development mode (`NODE_ENV !== "production"`)
- AppError class centralizes error code, message, and status code

## TLS / HTTPS

The HTTP server switches to HTTPS when `TLS_ENABLED=true`/`1`:

| Variable | Default | Purpose |
|---|---|---|
| `TLS_ENABLED` | `false` | Serve HTTPS instead of HTTP |
| `TLS_KEY_PATH` | `/etc/ssl/reconvault/server.key` | Private key (must be readable by the app user) |
| `TLS_CERT_PATH` | `/etc/ssl/reconvault/server.crt` | Certificate/chain |
| `TLS_CA_PATH` | unset | Optional CA bundle |

Also set `SESSION_SECURE=true` so the session cookie is only sent over HTTPS, and set `APP_URL` to the matching `https://` base URL.

Generate a development certificate (self-signed, with matching SAN entries):

```bash
openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
  -keyout server.key -out server.crt \
  -subj "/CN=reconvault.sec" \
  -addext "subjectAltName=DNS:reconvault.sec,DNS:localhost,IP:127.0.0.1"
```

Notes:
- The app exits with an explicit error if TLS is enabled and the key/cert cannot be read.
- `runServer_test.sh` health-checks with `https://` and `curl -k` when TLS is enabled.
- `tests/backend_test.js` disables certificate verification for local self-signed certs.
- Binding ports below 1024 (including 443) requires root or `CAP_NET_BIND_SERVICE`; otherwise run on a high port and put a reverse proxy in front.

## Potential Vulnerabilities (Known Prototype Limitations)

### 1. No Rate Limiting
- No request rate limiting currently implemented
- Add middleware for brute-force protection in production

### 2. No CSRF Protection
- Session-based but no CSRF tokens validated
- `sameSite: "strict"` provides some protection
- Consider adding CSRF protection for state-changing endpoints

### 3. Session Fixation Risk
- `req.session.regenerate()` called on login (in authController.js)
- This mitigates session fixation but should be verified in deployment

### 4. nmap Binary Dependencies
- `NMAP_PATH` must point to valid nmap binary
- Path exposure via `.env` — protect environment
- nmap execution outside this prototype's scope (configured but not integrated)

### 5. No Input Size Limits Beyond Validation
- String sanitization has maxLength defaults
- Large TEXT/BLOB fields could potentially cause issues
- Database-level limits enforced by schema

### 6. Open Redirect / Open URL Potential
- No explicit URL validation beyond IP/domain in targets
- References field in findings is free-form text

### 7. SQL Injection Surface
- Code uses prepared statements (mysql2 promise with params)
- All queries parameterized
- Residual risk if new code adds raw SQL without parameterization

### 8. Session Hijacking
- Sessions stored in MySQL, could be targeted
- Use HTTPS in production (`SESSION_SECURE=true`)
- Regenerate sessions on login already implemented
