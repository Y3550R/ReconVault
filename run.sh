#!/usr/bin/env bash
# ReconVault - Startup & Cleanup Script
# Starts MariaDB on port 3315, runs the app, cleans up on exit
# All binary paths are explicit - no PATH lookups

set -euo pipefail

# Binary paths (override via env if needed)
MARIADB_BIN="${MARIADB_BIN:-/usr/bin/mariadb}"
MARIADBD_BIN="${MARIADBD_BIN:-/usr/bin/mariadbd}"
MARIADB_INSTALL_DB_BIN="${MARIADB_INSTALL_DB_BIN:-/usr/bin/mariadb-install-db}"
NODE_BIN="${NODE_BIN:-/usr/bin/node}"
NPM_BIN="${NPM_BIN:-/usr/bin/npm}"
CURL_BIN="${CURL_BIN:-/usr/bin/curl}"

# Configuration
MARIADB_DATADIR="/tmp/mariadb-data"
MARIADB_PORT=3315
MARIADB_SOCKET="/tmp/mariadb.sock"
MARIADB_LOG="/tmp/mariadb.log"
MARIADB_PID_FILE="/tmp/mariadb.pid"
APP_PORT=3000
APP_PID_FILE="/tmp/reconvault.pid"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[ReconVault]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

cleanup() {
  log "Shutting down..."

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

  # Stop MariaDB
  if [[ -f "$MARIADB_PID_FILE" ]]; then
    MARIADB_PID=$(cat "$MARIADB_PID_FILE")
    if kill -0 "$MARIADB_PID" 2>/dev/null; then
      log "Stopping MariaDB (PID: $MARIADB_PID)..."
      kill "$MARIADB_PID" 2>/dev/null || true
      wait "$MARIADB_PID" 2>/dev/null || true
    fi
    rm -f "$MARIADB_PID_FILE"
  fi

  # Cleanup socket
  rm -f "$MARIADB_SOCKET"

  log "Cleanup complete"
}

trap cleanup EXIT INT TERM

# Start MariaDB
start_mariadb() {
  log "Starting MariaDB on port $MARIADB_PORT..."

  if [[ ! -d "$MARIADB_DATADIR" ]]; then
    log "Initializing MariaDB data directory..."
    "$MARIADB_INSTALL_DB_BIN" --datadir="$MARIADB_DATADIR" --auth-root-authentication-method=normal >/dev/null 2>&1
  fi

  "$MARIADBD_BIN" \
    --datadir="$MARIADB_DATADIR" \
    --port="$MARIADB_PORT" \
    --socket="$MARIADB_SOCKET" \
    --skip-networking=0 \
    --bind-address=0.0.0.0 \
    --pid-file="$MARIADB_PID_FILE" \
    > "$MARIADB_LOG" 2>&1 &

  MARIADB_PID=$!
  echo "$MARIADB_PID" > "$MARIADB_PID_FILE"

  # Wait for MariaDB to be ready
  local retries=30
  while (( retries > 0 )); do
    if "$MARIADB_BIN" --protocol=tcp --port="$MARIADB_PORT" -u root -e "SELECT 1" >/dev/null 2>&1; then
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

  # Setup users
  log "Configuring database users..."
  "$MARIADB_BIN" --protocol=tcp --port="$MARIADB_PORT" -u root -e "
    CREATE USER IF NOT EXISTS 'reconvault'@'%' IDENTIFIED BY '${DB_PASSWORD}';
    GRANT ALL PRIVILEGES ON reconvault.* TO 'reconvault'@'%';
    CREATE USER IF NOT EXISTS 'reconvault'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
    GRANT ALL PRIVILEGES ON reconvault.* TO 'reconvault'@'localhost';
    FLUSH PRIVILEGES;
  " >/dev/null 2>&1

  log "Database users configured"
}

# Start App
start_app() {
  log "Starting ReconVault app on port $APP_PORT..."

  # Check .env exists
  if [[ ! -f ".env" ]]; then
    err ".env file not found. Copy .env.example to .env and configure."
    exit 1
  fi

  "$NODE_BIN" src/server.js &
  APP_PID=$!
  echo "$APP_PID" > "$APP_PID_FILE"

  # Wait for app
  local retries=10
  while (( retries > 0 )); do
    if "$CURL_BIN" -s "http://localhost:$APP_PORT/health" >/dev/null 2>&1; then
      log "App ready at http://localhost:$APP_PORT"
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

  start_mariadb
  start_app

  log "ReconVault is running!"
  log "  App: http://localhost:$APP_PORT"
  log "  DB:  $MARIADB_BIN --protocol=tcp --port=$MARIADB_PORT -u reconvault -p"
  log ""
  log "Press Ctrl+C to stop"

  # Wait for app
  wait "$APP_PID"
}

main "$@"