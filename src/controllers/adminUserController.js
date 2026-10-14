import { query, execute, transaction } from "../db.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";
import { validateEnum, sanitizeString } from "../utils/validation.js";
import { hashPassword } from "../services/password.js";

export const listUsers = asyncHandler(async (req, res) => {
  const users = await query(
    `SELECT u.*,
       EXISTS(SELECT 1 FROM administrators WHERE user_id = u.user_id) AS is_admin,
       EXISTS(SELECT 1 FROM pentesters WHERE user_id = u.user_id) AS is_pentester,
       EXISTS(SELECT 1 FROM clients WHERE user_id = u.user_id) AS is_client
     FROM users u
     ORDER BY u.created_at DESC`
  );

  res.json({ users });
});

export const getUser = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId, 10);

  const user = await query(
    `SELECT u.*,
       EXISTS(SELECT 1 FROM administrators WHERE user_id = u.user_id) AS is_admin,
       EXISTS(SELECT 1 FROM pentesters WHERE user_id = u.user_id) AS is_pentester,
       EXISTS(SELECT 1 FROM clients WHERE user_id = u.user_id) AS is_client
     FROM users u
     WHERE u.user_id = ?`,
    [userId]
  );

  if (!user.length) {
    throw new AppError("User not found", 404, "NOT_FOUND");
  }

  if (user[0].is_client) {
    const client = await query("SELECT client_organization_id FROM clients WHERE user_id = ?", [user[0].user_id]);
    user[0].client_organization_id = client[0]?.client_organization_id ?? null;
  }

  res.json({ user: user[0] });
});

export const createUser = asyncHandler(async (req, res) => {
  const { username, password, status, roles } = req.body;

  if (!username || !password) {
    throw new AppError("username and password required", 400, "VALIDATION_ERROR");
  }

  if (username.length < 3 || username.length > 50) {
    throw new AppError("Username must be 3-50 characters", 400, "VALIDATION_ERROR");
  }

  if (password.length < 12) {
    throw new AppError("Password must be at least 12 characters", 400, "VALIDATION_ERROR");
  }

  const existing = await query("SELECT 1 FROM users WHERE username = ?", [username]);
  if (existing.length) {
    throw new AppError("Username already exists", 409, "CONFLICT");
  }

  const passwordHash = await hashPassword(password);
  const userStatus = status || "ACTIVE";
  if (!["ACTIVE", "INACTIVE"].includes(userStatus)) {
    throw new AppError("Invalid status", 400, "VALIDATION_ERROR");
  }

  const result = await execute(
    "INSERT INTO users (username, password_hash, status) VALUES (?, ?, ?)",
    [username, passwordHash, userStatus]
  );

  const userId = result.insertId;

  if (roles?.includes("admin")) {
    await execute("INSERT INTO administrators (user_id) VALUES (?)", [userId]);
  }
  if (roles?.includes("pentester")) {
    await execute("INSERT INTO pentesters (user_id) VALUES (?)", [userId]);
  }
  if (roles?.includes("client")) {
    const { client_organization_id } = req.body;
    if (client_organization_id) {
      await execute("INSERT INTO clients (user_id, client_organization_id) VALUES (?, ?)", [userId, client_organization_id]);
    } else {
      await execute("INSERT INTO clients (user_id) VALUES (?)", [userId]);
    }
  }

  const user = await query(
    `SELECT u.*,
       EXISTS(SELECT 1 FROM administrators WHERE user_id = u.user_id) AS is_admin,
       EXISTS(SELECT 1 FROM pentesters WHERE user_id = u.user_id) AS is_pentester,
       EXISTS(SELECT 1 FROM clients WHERE user_id = u.user_id) AS is_client
     FROM users u
     WHERE u.user_id = ?`,
    [userId]
  );

  res.status(201).json({ user: user[0] });
});

export const updateUser = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const { username, status, roles, password } = req.body;

  const user = await query("SELECT * FROM users WHERE user_id = ?", [userId]);
  if (!user.length) {
    throw new AppError("User not found", 404, "NOT_FOUND");
  }

  if (username) {
    if (username.length < 3 || username.length > 50) {
      throw new AppError("Username must be 3-50 characters", 400, "VALIDATION_ERROR");
    }
    const existing = await query("SELECT 1 FROM users WHERE username = ? AND user_id != ?", [username, userId]);
    if (existing.length) {
      throw new AppError("Username already exists", 409, "CONFLICT");
    }
  }

  if (status && !["ACTIVE", "INACTIVE"].includes(status)) {
    throw new AppError("Invalid status", 400, "VALIDATION_ERROR");
  }

  const updateFields = [];
  const updateValues = [];

  if (username) {
    updateFields.push("username = ?");
    updateValues.push(username);
  }
  if (status) {
    updateFields.push("status = ?");
    updateValues.push(status);
  }
  if (password) {
    if (password.length < 12) {
      throw new AppError("Password must be at least 12 characters", 400, "VALIDATION_ERROR");
    }
    const passwordHash = await hashPassword(password);
    updateFields.push("password_hash = ?");
    updateValues.push(passwordHash);
  }

  if (updateFields.length > 0) {
    updateValues.push(userId);
    await execute(`UPDATE users SET ${updateFields.join(", ")} WHERE user_id = ?`, updateValues);
  }

  if (roles) {
    const currentRoles = await query(
      `SELECT
         EXISTS(SELECT 1 FROM administrators WHERE user_id = ?) AS is_admin,
         EXISTS(SELECT 1 FROM pentesters WHERE user_id = ?) AS is_pentester,
         EXISTS(SELECT 1 FROM clients WHERE user_id = ?) AS is_client
       `,
      [userId, userId, userId]
    );

    if (roles.includes("admin") && !currentRoles[0].is_admin) {
      await execute("INSERT INTO administrators (user_id) VALUES (?)", [userId]);
    } else if (!roles.includes("admin") && currentRoles[0].is_admin) {
      await execute("DELETE FROM administrators WHERE user_id = ?", [userId]);
    }

    if (roles.includes("pentester") && !currentRoles[0].is_pentester) {
      await execute("INSERT INTO pentesters (user_id) VALUES (?)", [userId]);
    } else if (!roles.includes("pentester") && currentRoles[0].is_pentester) {
      await execute("DELETE FROM pentesters WHERE user_id = ?", [userId]);
    }

    if (roles.includes("client") && !currentRoles[0].is_client) {
      const { client_organization_id } = req.body;
      await execute("INSERT INTO clients (user_id, client_organization_id) VALUES (?, ?)", [userId, client_organization_id || null]);
    } else if (!roles.includes("client") && currentRoles[0].is_client) {
      await execute("DELETE FROM clients WHERE user_id = ?", [userId]);
    }
  }

  const updated = await query(
    `SELECT u.*,
       EXISTS(SELECT 1 FROM administrators WHERE user_id = u.user_id) AS is_admin,
       EXISTS(SELECT 1 FROM pentesters WHERE user_id = u.user_id) AS is_pentester,
       EXISTS(SELECT 1 FROM clients WHERE user_id = u.user_id) AS is_client
     FROM users u
     WHERE u.user_id = ?`,
    [userId]
  );

  res.json({ user: updated[0] });
});

export const listRoles = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId, 10);

  const roles = await query(
    `SELECT
       EXISTS(SELECT 1 FROM administrators WHERE user_id = ?) AS is_admin,
       EXISTS(SELECT 1 FROM pentesters WHERE user_id = ?) AS is_pentester,
       EXISTS(SELECT 1 FROM clients WHERE user_id = ?) AS is_client
     `,
    [userId, userId, userId]
  );

  res.json({ roles: roles[0] });
});

export const addRole = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const { role } = req.body;

  if (!["admin", "pentester", "client"].includes(role)) {
    throw new AppError("Invalid role", 400, "VALIDATION_ERROR");
  }

  const user = await query("SELECT 1 FROM users WHERE user_id = ?", [userId]);
  if (!user.length) {
    throw new AppError("User not found", 404, "NOT_FOUND");
  }

  if (role === "admin") {
    await execute("INSERT IGNORE INTO administrators (user_id) VALUES (?)", [userId]);
  } else if (role === "pentester") {
    await execute("INSERT IGNORE INTO pentesters (user_id) VALUES (?)", [userId]);
  } else if (role === "client") {
    await execute("INSERT IGNORE INTO clients (user_id) VALUES (?, ?)", [userId]);
  }

  res.json({ success: true });
});

export const removeRole = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const { role } = req.body;

  if (!["admin", "pentester", "client"].includes(role)) {
    throw new AppError("Invalid role", 400, "VALIDATION_ERROR");
  }

  if (role === "admin") {
    await execute("DELETE FROM administrators WHERE user_id = ?", [userId]);
  } else if (role === "pentester") {
    await execute("DELETE FROM pentesters WHERE user_id = ?", [userId]);
  } else if (role === "client") {
    await execute("DELETE FROM clients WHERE user_id = ?", [userId]);
  }

  res.json({ success: true });
});

export const getOrganization = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId, 10);

  const user = await query(
    `SELECT u.*,
      EXISTS(SELECT 1 FROM clients WHERE user_id = u.user_id) AS is_client
      FROM users u
      WHERE u.user_id = ?`,
    [userId]
  );

  if (!user.length) {
    throw new AppError("User not found", 404, "NOT_FOUND");
  }

  if (!user[0].is_client) {
    throw new AppError("User is not a Client", 404, "USER_IS_NOT_A_CLIENT");
  }

  const org = await query(
    `SELECT co.organization_id, co.name, co.contact_information
    FROM clients c
    LEFT JOIN client_organizations co
    ON c.client_organization_id = co.organization_id
    WHERE c.user_id = ?`,
    [userId]
  );

  res.json({
    organization_id: org[0]?.organization_id ?? null,
    name: org[0]?.name ?? null,
    contact_information: org[0]?.contact_information ?? null,
  });
});

export const changeOrganization = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const { client_organization_id } = req.body;

  const user = await query(
    `SELECT u.*,
    EXISTS(SELECT 1 FROM clients WHERE user_id = u.user_id) AS is_client
    FROM users u
    WHERE u.user_id = ?`,
    [userId]
  );

  if (!user.length) {
    throw new AppError("User not found", 404, "NOT_FOUND");
  }

  if (!user[0].is_client) {
    throw new AppError("User is not a Client", 404, "USER_IS_NOT_A_CLIENT");
  }

  if (!client_organization_id) {
    await query(
      `UPDATE clients
      SET client_organization_id = NULL
      WHERE user_id = ?`,
      [userId]
    );

    return res.json({
      message: "Client Organization removed successfully",
    });
  }

  const organization = await query(
    `SELECT organization_id
    FROM client_organizations
    WHERE organization_id = ?`,
    [client_organization_id]
  );

  if (!organization.length) {
    throw new AppError(
      "Client organization not found",
      404,
      "ORGANIZATION_NOT_FOUND"
    );
  }

  await query(
    `UPDATE clients
    SET client_organization_id = ?
    WHERE user_id = ?`,
    [client_organization_id, userId]
  );

  res.json({
    message: "Client Organization updated successfully",
  });
});
