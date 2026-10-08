import { query, execute, transaction } from "../db.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";
import { validateEnum, sanitizeString } from "../utils/validation.js";

export const listEngagements = asyncHandler(async (req, res) => {
  const engagements = await getAccessibleEngagements(req.user);
  res.json({ engagements });
});

export const getEngagement = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const engagement = await query("SELECT * FROM engagements WHERE engagement_id = ?", [engagementId]);

  if (!engagement.length) {
    throw new AppError("Engagement not found", 404, "NOT_FOUND");
  }

  res.json({ engagement: engagement[0] });
});

export const createEngagement = asyncHandler(async (req, res) => {
  const { name, description, start_date, end_date, status } = req.body;

  if (!name || !start_date) {
    throw new AppError("Name and start_date required", 400, "VALIDATION_ERROR");
  }

  if (status && !validateEnum(status, ["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"])) {
    throw new AppError("Invalid status", 400, "VALIDATION_ERROR");
  }

  const result = await execute(
    "INSERT INTO engagements (name, description, start_date, end_date, status) VALUES (?, ?, ?, ?, ?)",
    [sanitizeString(name, 150), sanitizeString(description, 1000), start_date, end_date || null, status || "PLANNED"]
  );

  const engagementId = result.insertId;

  // Automatically add creator as a member (pentester) if they have pentester role
  if (req.user.roles.isPentester) {
    await execute("INSERT INTO engagement_members (engagement_id, user_id) VALUES (?, ?)", [engagementId, req.user.user_id]);
  }

  const engagement = await query("SELECT * FROM engagements WHERE engagement_id = ?", [engagementId]);
  res.status(201).json({ engagement: engagement[0] });
});

export const updateEngagement = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const { name, description, start_date, end_date, status } = req.body;

  const engagement = await query("SELECT * FROM engagements WHERE engagement_id = ?", [engagementId]);
  if (!engagement.length) {
    throw new AppError("Engagement not found", 404, "NOT_FOUND");
  }

  if (status && !validateEnum(status, ["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"])) {
    throw new AppError("Invalid status", 400, "VALIDATION_ERROR");
  }

  await execute(
    "UPDATE engagements SET name = ?, description = ?, start_date = ?, end_date = ?, status = ?, updated_at = NOW() WHERE engagement_id = ?",
    [
      sanitizeString(name, 150),
      sanitizeString(description, 1000),
      start_date ?? engagement[0].start_date,
      end_date ?? engagement[0].end_date,
      status || engagement[0].status,
      engagementId,
    ]
  );

  const updated = await query("SELECT * FROM engagements WHERE engagement_id = ?", [engagementId]);
  res.json({ engagement: updated[0] });
});

export const deleteEngagement = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const result = await execute("DELETE FROM engagements WHERE engagement_id = ?", [engagementId]);

  if (result.affectedRows === 0) {
    throw new AppError("Engagement not found", 404, "NOT_FOUND");
  }

  res.json({ success: true });
});

async function getAccessibleEngagements(user) {
  const { isAdmin, isPentester, isClient, clientOrganizationId } = user.roles;

  if (isAdmin) {
    return query("SELECT * FROM engagements ORDER BY created_at DESC");
  }

  if (isPentester) {
    return query(
      `SELECT e.* FROM engagements e
       JOIN engagement_members em ON e.engagement_id = em.engagement_id
       WHERE em.user_id = ?
       ORDER BY e.created_at DESC`,
      [user.user_id]
    );
  }

  if (isClient && clientOrganizationId) {
    return query(
      `SELECT e.* FROM engagements e
       JOIN engagement_organizations eo ON e.engagement_id = eo.engagement_id
       WHERE eo.organization_id = ?
       ORDER BY e.created_at DESC`,
      [clientOrganizationId]
    );
  }

  return [];
}