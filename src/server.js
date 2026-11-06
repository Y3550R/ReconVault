import fs from "node:fs";
import http from "node:http";
import https from "node:https";

import { app } from "./app.js";
import { config } from "./config/index.js";
import { close } from "./db.js";
import {
  cancelAllRunningScans,
  recoverOrphanedScans,
} from "./services/scanExecutor.js";
import { attachScanWebSocket } from "./ws/scanStream.js";

function loadTlsOptions() {
  let key;
  let cert;
  let ca;

  try {
    key = fs.readFileSync(config.tls.keyPath);
    cert = fs.readFileSync(config.tls.certPath);

    if (config.tls.caPath) {
      ca = fs.readFileSync(config.tls.caPath);
    }
  } catch (error) {
    console.error("Failed to load TLS certificate files.");
    console.error(`  Key:  ${config.tls.keyPath}`);
    console.error(`  Cert: ${config.tls.certPath}`);
    if (config.tls.caPath) console.error(`  CA:   ${config.tls.caPath}`);
    console.error(`  ${error.code || "ERROR"}: ${error.message}`);
    console.error(
      "Fix the paths/permissions (TLS_KEY_PATH, TLS_CERT_PATH) or set TLS_ENABLED=false to serve HTTP."
    );
    process.exit(1);
  }

  return { key, cert, ...(ca ? { ca } : {}) };
}

function createServer() {
  if (!config.tls.enabled) {
    if (config.session.secure) {
      console.warn(
        "SESSION_SECURE=true but TLS is disabled; browsers will not send the secure session cookie over HTTP."
      );
    }

    return { server: http.createServer(app), protocol: "http" };
  }

  if (!config.session.secure) {
    console.warn(
      "TLS is enabled but SESSION_SECURE is not true; set SESSION_SECURE=true so the session cookie is only sent over HTTPS."
    );
  }

  return {
    server: https.createServer(loadTlsOptions(), app),
    protocol: "https",
  };
}

const { server, protocol } = createServer();

const scanWebSocket = attachScanWebSocket(server);

server.listen(config.port, config.host, async () => {
  console.log(`ReconVault running on ${protocol}://${config.host}:${config.port}`);
  console.log(`Environment: ${config.env}`);

  try {
    const recovered = await recoverOrphanedScans();

    if (recovered > 0) {
      console.log(
        `Recovered ${recovered} orphaned scan(s) from previous session`
      );
    }
  } catch (err) {
    console.error("Failed to recover orphaned scans:", err);
  }
});

// Handle unhandled errors without crashing the server
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

const shutdown = async (signal) => {
  console.log(`${signal} received, shutting down gracefully...`);

  try {
    const cancelled = await cancelAllRunningScans();

    if (cancelled > 0) {
      console.log(`Cancelled ${cancelled} running scan(s)`);
    }
  } catch (err) {
    console.error("Error cancelling running scans:", err);
  }

  scanWebSocket.close();

  server.close(async () => {
    await close();
    console.log("Database connections closed");
    process.exit(0);
  });

  setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export { server };
