#!/usr/bin/env bash
# ReconVault - Startup & Cleanup Script
# Starts MariaDB on port 3315, runs the app, cleans up on exit
# All binary paths are explicit - no PATH lookups

set -euo pipefail

LOG_FILE="/tmp/testRun.log"
rm -f "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

# Binary paths (override via env if needed)
MARIADB_BIN="${MARIADB_BIN:-/usr/bin/mariadb}"
MARIADBD_BIN="${MARIADBD_BIN:-/usr/bin/mariadbd}"
MARIADB_ADMIN_BIN="${MARIADB_ADMIN_BIN:-/usr/bin/mariadb-admin}"
MARIADB_INSTALL_DB_BIN="${MARIADB_INSTALL_DB_BIN:-/usr/bin/mariadb-install-db}"
NODE_BIN="${NODE_BIN:-/usr/bin/node}"
NPM_BIN="${NPM_BIN:-/usr/bin/npm}"
CURL_BIN="${CURL_BIN:-/usr/bin/curl}"

# Load environment variables from .env
if [[ -f ".env" ]]; then
  set -a
  source .env
  set +a
fi

# Configuration
MARIADB_RUNNER="${SUDO_USER:-$(logname)}"
MARIADB_DATADIR="/tmp/mariadb-data"
MARIADB_PORT=3315
MARIADB_SOCKET="/tmp/mariadb.sock"
MARIADB_LOG="/tmp/mariadb-$(date +%Y-%m-%d-%H%M%S).log"
MARIADB_PID_FILE="/tmp/mariadb.pid"
APP_HOST="${HOST:-127.0.0.1}"
APP_PORT="${PORT:-3000}"
APP_SCHEME="http"
if [[ "${TLS_ENABLED:-false}" == "true" || "${TLS_ENABLED:-false}" == "1" ]]; then
  APP_SCHEME="https"
fi
APP_TLS_KEY="${TLS_KEY_PATH:-/etc/ssl/reconvault/server.key}"
APP_TLS_CERT="${TLS_CERT_PATH:-/etc/ssl/reconvault/server.crt}"

# Omit the port only when it matches the scheme's default.
if [[ ( "$APP_SCHEME" == "https" && "$APP_PORT" == "443" ) || ( "$APP_SCHEME" == "http" && "$APP_PORT" == "80" ) ]]; then
  APP_URL_DISPLAY="${APP_SCHEME}://${APP_HOST}"
else
  APP_URL_DISPLAY="${APP_SCHEME}://${APP_HOST}:${APP_PORT}"
fi

APP_PID_FILE="/tmp/reconvault.pid"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[ReconVault]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
require_env_vars() {
  local missing=()

  for var in "$@"; do
    if [[ -z "${!var:-}" ]]; then
      missing+=("$var")
    fi
  done

  if (( ${#missing[@]} > 0 )); then
    for var in "${missing[@]}"; do
      err "$var not set in .env"
    done
    exit 1
  fi
}

cleanup() {
  log "Shutting down..."

  local runner="${SUDO_USER:-$(logname)}"

  # Stop app
  if [[ -f "$APP_PID_FILE" ]]; then
    APP_PID=$(cat "$APP_PID_FILE")
    if kill -0 "$APP_PID" 2>/dev/null; then
      log "Stopping app (PID: $APP_PID)..."
      kill "$APP_PID" 2>/dev/null || true
      wait "$APP_PID" 2>/dev/null || true
    fi
    rm -f "$APP_PID_FILE"
  fi

  # Stop MariaDB gracefully
  if [[ -S "$MARIADB_SOCKET" ]]; then
    log "Stopping MariaDB..."
    runuser -u "$runner" -- "$MARIADB_ADMIN_BIN" \
      --socket="$MARIADB_SOCKET" \
      -u root -p"$DB_ROOT_PASS" shutdown \
      >/dev/null 2>&1 || true

    # Wait for the server to stop
    local retries=10
    while (( retries > 0 )); do
      if ! runuser -u "$runner" -- "$MARIADB_ADMIN_BIN" \
        --socket="$MARIADB_SOCKET" \
        -u root -p"$DB_ROOT_PASS" ping \
        >/dev/null 2>&1; then
        break
      fi
      sleep 1
      ((retries--))
    done
  fi

  # Remove PID file
  rm -f "$MARIADB_PID_FILE"

  # Cleanup socket
  rm -f "$MARIADB_SOCKET"

  # Cleanup test database
  rm -rf "$MARIADB_DATADIR"

  log "Cleanup complete"
}

trap cleanup EXIT INT TERM

# Start MariaDB
start_mariadb() {
  local runner="${SUDO_USER:-$(logname)}"

  log "Starting MariaDB on port $MARIADB_PORT as $runner..."

  # Always remove old datadir and recreate
  if [[ -d "$MARIADB_DATADIR" ]]; then
    log "Removing old MariaDB data directory..."
    rm -rf "$MARIADB_DATADIR"
  fi

  install -d -o "$runner" -g "$(id -gn "$runner")" "$MARIADB_DATADIR"

  log "Initializing MariaDB data directory..."
  runuser -u "$runner" -- "$MARIADB_INSTALL_DB_BIN" \
    --datadir="$MARIADB_DATADIR" \
    --auth-root-authentication-method=normal >/dev/null 2>&1 || {
      err "MariaDB initialization failed"
      exit 1
    }

  log "Launching MariaDB..."
  runuser -u "$runner" -- "$MARIADBD_BIN" \
    --datadir="$MARIADB_DATADIR" \
    --port="$MARIADB_PORT" \
    --socket="$MARIADB_SOCKET" \
    --skip-networking=0 \
    --bind-address=127.0.0.1 \
    --pid-file="$MARIADB_PID_FILE" \
    > "$MARIADB_LOG" 2>&1 &

  MARIADB_PID=$!

  log "Waiting for MariaDB to become ready..."
  local retries=30
  while (( retries > 0 )); do
    if runuser -u "$runner" -- "$MARIADB_BIN" \
      --socket="$MARIADB_SOCKET" -u root -e "SELECT 1" \
      >/dev/null 2>&1; then
      log "MariaDB ready"
      break
    fi

    sleep 1
    ((retries--))
  done

  if (( retries == 0 )); then
    err "MariaDB failed to start. Check $MARIADB_LOG"
    exit 1
  fi

  log "Setting MariaDB root password..."
  runuser -u "$runner" -- "$MARIADB_BIN" \
    --socket="$MARIADB_SOCKET" \
    -u root \
    -e "ALTER USER 'root'@'localhost' IDENTIFIED BY '${DB_ROOT_PASS}';" \
    >/dev/null 2>&1 || {
      err "Failed to set MariaDB root password"
      exit 1
    }

  log "Configuring database roles..."
  runuser -u "$runner" -- "$MARIADB_BIN" \
    --socket="$MARIADB_SOCKET" -u root -p"$DB_ROOT_PASS" \
    -e "
      CREATE DATABASE IF NOT EXISTS ${DB_NAME}
        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

      -- Read-only role: SELECT + EXECUTE (stored procedures are read-only).
      CREATE USER IF NOT EXISTS '${DB_READONLY_USER}'@'%'
        IDENTIFIED BY '${DB_READONLY_PASS}';
      GRANT SELECT, EXECUTE ON ${DB_NAME}.* TO '${DB_READONLY_USER}'@'%';
      CREATE USER IF NOT EXISTS '${DB_READONLY_USER}'@'localhost'
        IDENTIFIED BY '${DB_READONLY_PASS}';
      GRANT SELECT, EXECUTE ON ${DB_NAME}.* TO '${DB_READONLY_USER}'@'localhost';

      -- Read-write role: regular application writes + sessions.
      CREATE USER IF NOT EXISTS '${DB_READWRITE_USER}'@'%'
        IDENTIFIED BY '${DB_READWRITE_PASS}';
      GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON ${DB_NAME}.* TO '${DB_READWRITE_USER}'@'%';
      CREATE USER IF NOT EXISTS '${DB_READWRITE_USER}'@'localhost'
        IDENTIFIED BY '${DB_READWRITE_PASS}';
      GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON ${DB_NAME}.* TO '${DB_READWRITE_USER}'@'localhost';

      -- Admin role: provisioning/schema only. The app never loads these.
      CREATE USER IF NOT EXISTS '${DB_ADMIN_USER}'@'%'
        IDENTIFIED BY '${DB_ADMIN_PASS}';
      GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_ADMIN_USER}'@'%';
      CREATE USER IF NOT EXISTS '${DB_ADMIN_USER}'@'localhost'
        IDENTIFIED BY '${DB_ADMIN_PASS}';
      GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_ADMIN_USER}'@'localhost';

      FLUSH PRIVILEGES;
    " >/dev/null 2>&1 || {
      err "Failed to configure database"
      exit 1
    }

  log "Running database schema as admin role..."
  runuser -u "$runner" -- "$MARIADB_BIN" \
    --socket="$MARIADB_SOCKET" -u "$DB_ADMIN_USER" -p"$DB_ADMIN_PASS" \
    -D "$DB_NAME" < database/schema.sql >/dev/null 2>&1 || {
      err "Failed to apply database schema"
      exit 1
    }

  log "Database configured"
}

# Seed admin user
seed_admin() {
  log "Seeding admin user..."
  
  # Wait a moment for the app to be ready
  sleep 2
  
  # Use Node to seed the webapp admin user via the database admin role.
  # This is provisioning only; the running application never sees these creds.
  "$NODE_BIN" -e "
    // Capture provisioning credentials before importing the app config
    // (src/config/index.js deliberately removes them from process.env).
    const dbHost = process.env.DB_HOST;
    const dbPort = Number(process.env.DB_PORT);
    const dbName = process.env.DB_NAME;
    const dbAdminUser = process.env.DB_ADMIN_USER;
    const dbAdminPass = process.env.DB_ADMIN_PASS;
    const adminUser = process.env.DB_DEFAULT_ADMIN_USER;
    const adminPass = process.env.DB_DEFAULT_ADMIN_PASS;

    const { default: mysql } = await import('mysql2/promise');
    const { hashPassword } = await import('./src/services/password.js');

    const connection = await mysql.createConnection({
      host: dbHost,
      port: dbPort,
      user: dbAdminUser,
      password: dbAdminPass,
      database: dbName,
    });

    const hash = await hashPassword(adminPass);
    await connection.execute(
      'INSERT IGNORE INTO users (username, password_hash, status) VALUES (?, ?, ?)',
      [adminUser, hash, 'ACTIVE']
    );
    await connection.execute(
      'INSERT IGNORE INTO administrators (user_id) SELECT user_id FROM users WHERE username = ?',
      [adminUser]
    );
    console.log('Admin user seeded');
    await connection.end();
  "
  
  log "Admin user seeded"
}

# Start App
start_app() {
  log "Starting ReconVault app on ${APP_HOST}:${APP_PORT}..."

  # Check .env exists
  if [[ ! -f ".env" ]]; then
    err ".env file not found. Copy .env.example to .env and configure."
    exit 1
  fi

  if [[ "$APP_SCHEME" == "https" ]]; then
    if [[ ! -r "$APP_TLS_KEY" ]]; then
      err "TLS private key is not readable: $APP_TLS_KEY"
      err "Run as the key owner or fix TLS_KEY_PATH / permissions."
      exit 1
    fi
    if [[ ! -r "$APP_TLS_CERT" ]]; then
      err "TLS certificate is not readable: $APP_TLS_CERT"
      err "Fix TLS_CERT_PATH or its permissions."
      exit 1
    fi
  fi

  # Launch the app in a subshell that drops provisioning credentials, so the
  # running process cannot read the root/admin database passwords.
  (
    unset DB_ROOT_PASS DB_ADMIN_USER DB_ADMIN_PASS
    exec "$NODE_BIN" src/server.js
  ) &
  APP_PID=$!
  echo "$APP_PID" > "$APP_PID_FILE"

  # Wait for app
  log "Waiting for the app to become ready..."
  local retries=10
  local curl_opts=(-s)
  if [[ "$APP_SCHEME" == "https" ]]; then
    # Development certificates are usually self-signed.
    curl_opts+=(-k)
  fi

  while (( retries > 0 )); do
    if "$CURL_BIN" "${curl_opts[@]}" "${APP_SCHEME}://${APP_HOST}:${APP_PORT}/health" >/dev/null 2>&1; then
      log "App ready at ${APP_URL_DISPLAY}"
      break
    fi
    sleep 1
    ((retries--))
  done

  if (( retries == 0 )); then
    err "App failed to start"
    exit 1
  fi
}

# Main
main() {
  log "Starting ReconVault..."

  # Check dependencies exist
  for bin in "$MARIADB_BIN" "$MARIADBD_BIN" "$MARIADB_INSTALL_DB_BIN" "$NODE_BIN" "$NPM_BIN" "$CURL_BIN"; do
    if [[ ! -x "$bin" ]]; then
      err "Required binary not found or not executable: $bin"
      exit 1
    fi
  done

  # Verify required env vars
  require_env_vars \
    DB_ROOT_PASS \
    DB_NAME \
    DB_READONLY_USER \
    DB_READONLY_PASS \
    DB_READWRITE_USER \
    DB_READWRITE_PASS \
    DB_ADMIN_USER \
    DB_ADMIN_PASS \
    DB_DEFAULT_ADMIN_USER \
    DB_DEFAULT_ADMIN_PASS

  start_mariadb
  seed_admin

  start_app

  log "ReconVault is running!"
  log "  App: ${APP_URL_DISPLAY}"
  log "  DB:  $MARIADB_BIN --socket=$MARIADB_SOCKET -u root -p"
  log ""
  log "Press Ctrl+C to stop"

  # Wait for app
  wait "$APP_PID"
}

main "$@"
