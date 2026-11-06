import dotenv from "dotenv";

dotenv.config();

const requiredEnv = [
  "SESSION_SECRET",
  "NMAP_PATH",
  "DB_HOST",
  "DB_PORT",
  "DB_ROOT_PASS",
  "DB_WEB_USER",
  "DB_WEB_PASS",
  "DB_NAME",
  "DB_DEFAULT_ADMIN_USER",
  "DB_DEFAULT_ADMIN_PASS"
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const config = {
  env: process.env.NODE_ENV || "development",
  host: process.env.HOST || "127.0.0.1",
  port: parseInt(process.env.PORT, 10) || 3000,

  session: {
    secret: process.env.SESSION_SECRET,
    name: process.env.SESSION_NAME || "reconvault.sid",
    maxAge: parseInt(process.env.SESSION_MAX_AGE, 10) || 86400000,
    secure: process.env.SESSION_SECURE === "true",
    httpOnly: true,
    sameSite: "strict",
  },

  database: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    user: process.env.DB_WEB_USER,
    password: process.env.DB_WEB_PASS,
    database: process.env.DB_NAME,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10
  },

  argon2: {
    memory: parseInt(process.env.ARGON2_MEMORY, 10) || 65536,
    iterations: parseInt(process.env.ARGON2_ITERATIONS, 10) || 3,
    parallelism: parseInt(process.env.ARGON2_PARALLELISM, 10) || 4,
  },

  nmap: {
    path: process.env.NMAP_PATH,
  },

  tls: {
    enabled: ["true", "1"].includes((process.env.TLS_ENABLED || "").toLowerCase()),
    keyPath: process.env.TLS_KEY_PATH || "/etc/ssl/reconvault/server.key",
    certPath: process.env.TLS_CERT_PATH || "/etc/ssl/reconvault/server.crt",
    caPath: process.env.TLS_CA_PATH || null,
  },

  scan: {
    maxConcurrent: parseInt(process.env.MAX_CONCURRENT_SCANS, 10) || 3,
    timeoutMs: parseInt(process.env.SCAN_TIMEOUT_MS, 10) || 1800000,
  },
};

export default config;
