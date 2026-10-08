import { query, execute, transaction } from "../db.js";
import { hashPassword, verifyPassword, needsRehash } from "../services/password.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";

export const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    throw new AppError("Username and password required", 400, "VALIDATION_ERROR");
  }

  const users = await query(
    "SELECT user_id, username, password_hash, status FROM users WHERE username = ? AND status = 'ACTIVE'",
    [username]
  );

  if (!users.length) {
    throw new AppError("Invalid credentials", 401, "AUTHENTICATION_ERROR");
  }

  const user = users[0];
  const valid = await verifyPassword(user.password_hash, password);

  if (!valid) {
    throw new AppError("Invalid credentials", 401, "AUTHENTICATION_ERROR");
  }

  if (needsRehash(user.password_hash)) {
    const newHash = await hashPassword(password);
    await execute("UPDATE users SET password_hash = ? WHERE user_id = ?", [newHash, user.user_id]);
  }

  const roles = await query(
    `SELECT
       EXISTS(SELECT 1 FROM administrators WHERE user_id = ?) AS is_admin,
       EXISTS(SELECT 1 FROM pentesters WHERE user_id = ?) AS is_pentester,
       EXISTS(SELECT 1 FROM clients WHERE user_id = ?) AS is_client
     `,
    [user.user_id, user.user_id, user.user_id]
  );

  const userRoles = {
    isAdmin: Boolean(roles[0].is_admin),
    isPentester: Boolean(roles[0].is_pentester),
    isClient: Boolean(roles[0].is_client),
  };

  let clientOrganizationId = null;
  if (userRoles.isClient) {
    const client = await query("SELECT client_organization_id FROM clients WHERE user_id = ?", [user.user_id]);
    clientOrganizationId = client[0]?.client_organization_id ?? null;
  }

  req.session.regenerate((err) => {
    if (err) throw err;
    // Set user data on the new session
    req.session.user = {
      user_id: user.user_id,
      username: user.username,
      roles: userRoles,
      clientOrganizationId,
    };
    res.json({ success: true, user: { user_id: user.user_id, username: user.username, roles: userRoles } });
  });
});

export const logout = asyncHandler(async (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error("Logout error:", err);
    res.clearCookie("reconvault.sid");
    res.json({ success: true });
  });
});

export const me = asyncHandler(async (req, res) => {
  if (!req.session.user) {
    throw new AppError("Not authenticated", 401, "AUTHENTICATION_ERROR");
  }
  res.json({ user: req.session.user });
});
