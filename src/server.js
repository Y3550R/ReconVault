import { app } from "./app.js";
import { config } from "./config/index.js";
import { close } from "./db.js";

const server = app.listen(config.port, config.host, () => {
  console.log(`ReconVault running on http://${config.host}:${config.port}`);
  console.log(`Environment: ${config.env}`);
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