import express from "express";
import session from "express-session";
import MySQLStoreFactory from "express-mysql-session";
import mysql from "mysql2";
import { config } from "./config/index.js";
import { createPool, getPool } from "./db.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { authMiddleware } from "./middleware/auth.js";
import authRoutes from "./routes/auth.js";
import engagementRoutes from "./routes/engagements.js";
import engagementNestedRoutes from "./routes/engagementNested.js";
import adminUserRoutes from "./routes/admin/users.js";
import adminOrgRoutes from "./routes/admin/organizations.js";

createPool(config.database);
const pool = getPool();

// Create a separate callback-style pool for session store
const sessionPool = mysql.createPool({
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  database: config.database.database,
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 0,
});

const MySQLStore = MySQLStoreFactory(session);

const sessionStore = new MySQLStore({
  clearExpired: true,
  checkExpirationInterval: 900000,
  expiration: config.session.maxAge,
  createDatabaseTable: true,
  endConnectionOnClose: true,
  charset: "utf8mb4_bin",
  schema: {
    tableName: "sessions",
    columnNames: {
      session_id: "session_id",
      expires: "expires",
      data: "data",
    },
  },
}, sessionPool);

const app = express();

app.set("trust proxy", true);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(session({
  name: config.session.name,
  secret: config.session.secret,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: config.session.httpOnly,
    secure: config.session.secure,
    sameSite: config.session.sameSite,
    maxAge: config.session.maxAge,
  },
}));

app.use(authMiddleware);

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

app.get("/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

app.use("/api/auth", authRoutes);
app.use("/api/engagements", engagementNestedRoutes);
app.use("/api/engagements", engagementRoutes);
app.use("/api/admin/users", adminUserRoutes);
app.use("/api/admin/organizations", adminOrgRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export { app, sessionStore, pool };