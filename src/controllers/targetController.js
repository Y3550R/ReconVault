import { query, execute, transaction, callProcedure } from "../db.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";
import { validateEnum, sanitizeString, validateIP, validateIPType } from "../utils/validation.js";
import { setCurrentUserId, clearCurrentUserId } from "../db.js";

export const listTargets = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const targets = await query("SELECT * FROM targets WHERE engagement_id = ? ORDER BY created_at DESC", [engagementId]);
  res.json({ targets });
});

export const getTarget = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const targetId = parseInt(req.params.targetId, 10);

  const [targets = [], services = [], findings = []] = await callProcedure(
    "sp_get_target_recon",
    [targetId, engagementId]
  );

  if (!targets.length) {
    throw new AppError("Target not found", 404, "NOT_FOUND");
  }

  res.json({ target: targets[0], services, findings });
});

export const createTarget = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const { ip_type, ip_address, domain_name, hostname, description, status, operating_system } = req.body;

  if (!ip_type || !ip_address) {
    throw new AppError("ip_type and ip_address required", 400, "VALIDATION_ERROR");
  }

  if (!validateEnum(ip_type, ["IPV4", "IPV6"])) {
    throw new AppError("ip_type must be IPV4 or IPV6", 400, "VALIDATION_ERROR");
  }

  if (!validateIP(ip_address) || validateIPType(ip_address) !== ip_type) {
    throw new AppError("ip_address does not match ip_type", 400, "VALIDATION_ERROR");
  }

  if (status && !validateEnum(status, ["ACTIVE", "INACTIVE"])) {
    throw new AppError("Invalid status", 400, "VALIDATION_ERROR");
  }

  await setCurrentUserId(req.user.user_id);
  try {
    const result = await execute(
      `INSERT INTO targets (engagement_id, ip_type, ip_address, domain_name, hostname, description, status, operating_system)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [engagementId, ip_type, ip_address, sanitizeString(domain_name, 253), sanitizeString(hostname, 63), sanitizeString(description, 1000), status || "ACTIVE", sanitizeString(operating_system, 255)]
    );

    const target = await query("SELECT * FROM targets WHERE target_id = ?", [result.insertId]);
    res.status(201).json({ target: target[0] });
  } finally {
    await clearCurrentUserId();
  }
});

export const updateTarget = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const targetId = parseInt(req.params.targetId, 10);
  const { ip_type, ip_address, domain_name, hostname, description, status, operating_system } = req.body;

  const target = await query("SELECT * FROM targets WHERE target_id = ? AND engagement_id = ?", [targetId, engagementId]);
  if (!target.length) {
    throw new AppError("Target not found", 404, "NOT_FOUND");
  }

  if (ip_type && !validateEnum(ip_type, ["IPV4", "IPV6"])) {
    throw new AppError("ip_type must be IPV4 or IPV6", 400, "VALIDATION_ERROR");
  }

  if (ip_address && !validateIP(ip_address)) {
    throw new AppError("Invalid ip_address", 400, "VALIDATION_ERROR");
  }

  if (status && !validateEnum(status, ["ACTIVE", "INACTIVE"])) {
    throw new AppError("Invalid status", 400, "VALIDATION_ERROR");
  }

  await setCurrentUserId(req.user.user_id);
  try {
    await execute(
      `UPDATE targets SET ip_type = ?, ip_address = ?, domain_name = ?, hostname = ?, description = ?, status = ?, operating_system = ?, updated_at = NOW()
       WHERE target_id = ? AND engagement_id = ?`,
      [
        ip_type || target[0].ip_type,
        ip_address || target[0].ip_address,
        sanitizeString(domain_name, 253),
        sanitizeString(hostname, 63),
        sanitizeString(description, 1000),
        status || target[0].status,
        sanitizeString(operating_system, 255),
        targetId,
        engagementId,
      ]
    );

    const updated = await query("SELECT * FROM targets WHERE target_id = ?", [targetId]);
    res.json({ target: updated[0] });
  } finally {
    await clearCurrentUserId();
  }
});

export const deleteTarget = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const targetId = parseInt(req.params.targetId, 10);

  const result = await execute("DELETE FROM targets WHERE target_id = ? AND engagement_id = ?", [targetId, engagementId]);
  if (result.affectedRows === 0) {
    throw new AppError("Target not found", 404, "NOT_FOUND");
  }

  res.json({ success: true });
});