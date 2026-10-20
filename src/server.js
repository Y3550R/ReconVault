import { app } from "./app.js";
import { config } from "./config/index.js";
import { close, query, execute } from "./db.js";
import { recoverOrphanedScans } from "./services/scanExecutor.js";

const server = app.listen(config.port, config.host, async () => {
  console.log(`ReconVault running on http://${config.host}:${config.port}`);
  console.log(`Environment: ${config.env}`);

  try {
    const recovered = await recoverOrphanedScans();
    if (recovered > 0) {
      console.log(`Recovered ${recovered} orphaned scan(s) from previous session`);
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

import { cancelAllRunningScans } from "./services/scanExecutor.js";

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