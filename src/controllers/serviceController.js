import { query, execute } from "../db.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";
import { validateEnum, sanitizeString, validatePort } from "../utils/validation.js";
import { setCurrentUserId, clearCurrentUserId } from "../db.js";

export const listServices = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const targetId = parseInt(req.params.targetId, 10);

  const services = await query(
    `SELECT s.* FROM services s
     JOIN targets t ON s.target_id = t.target_id
     WHERE s.target_id = ? AND t.engagement_id = ?
     ORDER BY s.port`,
    [targetId, engagementId]
  );

  res.json({ services });
});

export const getService = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const targetId = parseInt(req.params.targetId, 10);
  const serviceId = parseInt(req.params.serviceId, 10);

  const service = await query(
    `SELECT s.* FROM services s
     JOIN targets t ON s.target_id = t.target_id
     WHERE s.service_id = ? AND s.target_id = ? AND t.engagement_id = ?`,
    [serviceId, targetId, engagementId]
  );

  if (!service.length) {
    throw new AppError("Service not found", 404, "NOT_FOUND");
  }

  res.json({ service: service[0] });
});

export const createService = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const targetId = parseInt(req.params.targetId, 10);
  const { name, port, protocol, version, state } = req.body;

  if (!name || !port) {
    throw new AppError("name and port required", 400, "VALIDATION_ERROR");
  }

  if (!validatePort(port)) {
    throw new AppError("Port must be 1-65535", 400, "VALIDATION_ERROR");
  }

  if (protocol && !validateEnum(protocol, ["TCP", "UDP", "SCTP", "ICMP"])) {
    throw new AppError("Invalid protocol", 400, "VALIDATION_ERROR");
  }

  if (state && !validateEnum(state, ["UNKNOWN", "OPEN", "CLOSED", "FILTERED"])) {
    throw new AppError("Invalid state", 400, "VALIDATION_ERROR");
  }

  const target = await query("SELECT * FROM targets WHERE target_id = ? AND engagement_id = ?", [targetId, engagementId]);
  if (!target.length) {
    throw new AppError("Target not found", 404, "NOT_FOUND");
  }

  await setCurrentUserId(req.user.user_id);
  try {
    const result = await execute(
      `INSERT INTO services (target_id, name, port, protocol, version, state)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [targetId, name, port, protocol || "TCP", version || null, state || "UNKNOWN"]
    );

    const service = await query("SELECT * FROM services WHERE service_id = ?", [result.insertId]);
    res.status(201).json({ service: service[0] });
  } finally {
    await clearCurrentUserId();
  }
});

export const updateService = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const targetId = parseInt(req.params.targetId, 10);
  const serviceId = parseInt(req.params.serviceId, 10);
  const { name, port, protocol, version, state } = req.body;

  const service = await query(
    `SELECT s.* FROM services s
     JOIN targets t ON s.target_id = t.target_id
     WHERE s.service_id = ? AND s.target_id = ? AND t.engagement_id = ?`,
    [serviceId, targetId, engagementId]
  );

  if (!service.length) {
    throw new AppError("Service not found", 404, "NOT_FOUND");
  }

  if (port && !validatePort(port)) {
    throw new AppError("Port must be 1-65535", 400, "VALIDATION_ERROR");
  }

  if (protocol && !validateEnum(protocol, ["TCP", "UDP", "SCTP", "ICMP"])) {
    throw new AppError("Invalid protocol", 400, "VALIDATION_ERROR");
  }

  if (state && !validateEnum(state, ["UNKNOWN", "OPEN", "CLOSED", "FILTERED"])) {
    throw new AppError("Invalid state", 400, "VALIDATION_ERROR");
  }

  await setCurrentUserId(req.user.user_id);
  try {
    await execute(
      `UPDATE services SET name = ?, port = ?, protocol = ?, version = ?, state = ?, updated_at = NOW()
       WHERE service_id = ? AND target_id = ?`,
      [
        name || service[0].name,
        port || service[0].port,
        protocol || service[0].protocol,
        version !== undefined ? version : service[0].version,
        state || service[0].state,
        serviceId,
        targetId,
      ]
    );

    const updated = await query("SELECT * FROM services WHERE service_id = ?", [serviceId]);
    res.json({ service: updated[0] });
  } finally {
    await clearCurrentUserId();
  }
});

export const deleteService = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const targetId = parseInt(req.params.targetId, 10);
  const serviceId = parseInt(req.params.serviceId, 10);

  const result = await execute(
    `DELETE s FROM services s
     JOIN targets t ON s.target_id = t.target_id
     WHERE s.service_id = ? AND s.target_id = ? AND t.engagement_id = ?`,
    [serviceId, targetId, engagementId]
  );

  if (result.affectedRows === 0) {
    throw new AppError("Service not found", 404, "NOT_FOUND");
  }

  res.json({ success: true });
});