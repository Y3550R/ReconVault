import { query, execute, transaction } from "../db.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";
import { validateEnum } from "../utils/validation.js";
import { setCurrentUserId, clearCurrentUserId } from "../db.js";

export const listScans = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const scans = await query("SELECT * FROM scans WHERE engagement_id = ? ORDER BY created_at DESC", [engagementId]);
  res.json({ scans });
});

export const getScan = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const scanId = parseInt(req.params.scanId, 10);

  const scan = await query("SELECT * FROM scans WHERE scan_id = ? AND engagement_id = ?", [scanId, engagementId]);
  if (!scan.length) {
    throw new AppError("Scan not found", 404, "NOT_FOUND");
  }

  res.json({ scan: scan[0] });
});

export const createScan = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const { scan_type } = req.body;

  if (!validateEnum(scan_type, ["HOST", "PORT"])) {
    throw new AppError("scan_type must be HOST or PORT", 400, "VALIDATION_ERROR");
  }

  const engagement = await query("SELECT * FROM engagements WHERE engagement_id = ?", [engagementId]);
  if (!engagement.length) {
    throw new AppError("Engagement not found", 404, "NOT_FOUND");
  }

  const result = await execute(
    "INSERT INTO scans (engagement_id, creator_user_id, scan_type, status) VALUES (?, ?, ?, 'READY')",
    [engagementId, req.user.user_id, scan_type]
  );

  const scan = await query("SELECT * FROM scans WHERE scan_id = ?", [result.insertId]);
  res.status(201).json({ scan: scan[0] });
});

export const startScan = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const scanId = parseInt(req.params.scanId, 10);

  const scan = await query("SELECT * FROM scans WHERE scan_id = ? AND engagement_id = ?", [scanId, engagementId]);
  if (!scan.length) {
    throw new AppError("Scan not found", 404, "NOT_FOUND");
  }

  if (scan[0].status !== "READY") {
    throw new AppError("Scan can only be started from READY status", 400, "VALIDATION_ERROR");
  }

  const engagement = await query("SELECT * FROM engagements WHERE engagement_id = ?", [engagementId]);
  if (!engagement.length || engagement[0].status !== "ACTIVE") {
    throw new AppError("Engagement must be ACTIVE to start scans", 400, "VALIDATION_ERROR");
  }

  await execute(
    "UPDATE scans SET status = 'RUNNING', runner_user_id = ?, started_at = NOW(), updated_at = NOW() WHERE scan_id = ?",
    [req.user.user_id, scanId]
  );

  const scanUpdated = await query("SELECT * FROM scans WHERE scan_id = ?", [scanId]);
  res.json({ scan: scanUpdated[0] });
});

export const cancelScan = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const scanId = parseInt(req.params.scanId, 10);

  const scan = await query("SELECT * FROM scans WHERE scan_id = ? AND engagement_id = ?", [scanId, engagementId]);
  if (!scan.length) {
    throw new AppError("Scan not found", 404, "NOT_FOUND");
  }

  if (scan[0].status !== "RUNNING") {
    throw new AppError("Scan can only be cancelled from RUNNING status", 400, "VALIDATION_ERROR");
  }

  await execute(
    "UPDATE scans SET status = 'CANCELLED', canceller_user_id = ?, updated_at = NOW() WHERE scan_id = ?",
    [req.user.user_id, scanId]
  );

  const scanUpdated = await query("SELECT * FROM scans WHERE scan_id = ?", [scanId]);
  res.json({ scan: scanUpdated[0] });
});

export const deleteScan = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const scanId = parseInt(req.params.scanId, 10);

  const scan = await query("SELECT * FROM scans WHERE scan_id = ? AND engagement_id = ?", [scanId, engagementId]);
  if (!scan.length) {
    throw new AppError("Scan not found", 404, "NOT_FOUND");
  }

  if (scan[0].status === "RUNNING") {
    throw new AppError("Cannot delete a running scan. Cancel it first.", 400, "VALIDATION_ERROR");
  }

  const result = await execute("DELETE FROM scans WHERE scan_id = ? AND engagement_id = ?", [scanId, engagementId]);
  if (result.affectedRows === 0) {
    throw new AppError("Scan not found", 404, "NOT_FOUND");
  }

  res.json({ success: true });
});