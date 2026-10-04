import dotenv from "dotenv";

dotenv.config();

const requiredEnv = [
  "SESSION_SECRET",
  "NMAP_PATH",
  "DB_HOST",
  "DB_PORT",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const config = {
  env: process.env.NODE_ENV || "development",
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
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10,
  },

  argon2: {
    memory: parseInt(process.env.ARGON2_MEMORY, 10) || 65536,
    iterations: parseInt(process.env.ARGON2_ITERATIONS, 10) || 3,
    parallelism: parseInt(process.env.ARGON2_PARALLELISM, 10) || 4,
  },

  nmap: {
    path: process.env.NMAP_PATH,
  },
};

export default config;
