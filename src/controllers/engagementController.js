import { query, execute, transaction, callProcedure } from "../db.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";
import { validateEnum, sanitizeString } from "../utils/validation.js";

async function getAccessibleEngagements(user) {
  const [engagements = []] = await callProcedure("sp_get_user_engagements", [
    user.user_id,
  ]);
  return engagements;
}

export const listEngagements = asyncHandler(async (req, res) => {
  const engagements = await getAccessibleEngagements(req.user);
  res.json({ engagements });
});

export const getEngagement = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const [engagement = []] = await callProcedure("sp_get_engagement_summary", [
    engagementId,
  ]);

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

  const engagementId = await transaction(async (conn) => {
    const [result] = await conn.execute(
      "INSERT INTO engagements (name, description, start_date, end_date, status) VALUES (?, ?, ?, ?, ?)",
      [sanitizeString(name, 150), sanitizeString(description, 1000), start_date, end_date || null, status || "PLANNED"]
    );

    const newEngagementId = result.insertId;

    // Automatically add creator as a member (pentester) if they have pentester role
    if (req.user.roles.isPentester) {
      await conn.execute(
        "INSERT INTO engagement_members (engagement_id, user_id) VALUES (?, ?)",
        [newEngagementId, req.user.user_id]
      );
    }

    return newEngagementId;
  });

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
      start_date || engagement[0].start_date,
      end_date === undefined ? engagement[0].end_date : (end_date || null),
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

export const listEngagementMembers = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);

  const members = await query(
    `SELECT u.* FROM users u
    JOIN engagement_members em ON u.user_id = em.user_id
    WHERE em.engagement_id = ?`,
    [engagementId]
  );

  res.json({ members: members });
});

export const addEngagementMember = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const { user_id } = req.body;
  if (!user_id) throw new AppError("user_id required", 400, "VALIDATION_ERROR");

  const user = await query("SELECT 1 FROM users WHERE user_id = ?", [user_id]);
  if (!user.length) throw new AppError("User not found", 404, "NOT_FOUND");

  await execute("INSERT IGNORE INTO engagement_members (engagement_id, user_id) VALUES (?, ?)", [engagementId, user_id]);
  res.json({ success: true });
});

export const removeEngagementMember = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const userId = parseInt(req.params.userId, 10);
  await execute("DELETE FROM engagement_members WHERE engagement_id = ? AND user_id = ?", [engagementId, userId]);
  res.json({ success: true });
});

export const listEngagementOrganizations = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);

  const orgs = await query(
    `SELECT co.* FROM client_organizations co
    JOIN engagement_organizations eo ON co.organization_id = eo.organization_id
    WHERE eo.engagement_id = ?`,
    [engagementId]
  );

  res.json({ organizations: orgs });
});

export const addEngagementOrganization = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const { organization_id } = req.body;

  const engagement = await query("SELECT 1 FROM engagements WHERE engagement_id = ?", [engagementId]);
  if (!engagement.length) {
    throw new AppError("Engagement not found", 404, "NOT_FOUND");
  }

  const org = await query("SELECT 1 FROM client_organizations WHERE organization_id = ?", [organization_id]);
  if (!org.length) {
    throw new AppError("Organization not found", 404, "NOT_FOUND");
  }

  await execute("INSERT IGNORE INTO engagement_organizations (engagement_id, organization_id) VALUES (?, ?)", [engagementId, organization_id]);
  res.json({ success: true });
});

export const removeEngagementOrganization = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const organizationId = parseInt(req.params.organizationId, 10);

  await execute("DELETE FROM engagement_organizations WHERE engagement_id = ? AND organization_id = ?", [engagementId, organizationId]);
  res.json({ success: true });
});
