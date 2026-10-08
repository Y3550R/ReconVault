import { query, execute, transaction } from "../db.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";
import { sanitizeString } from "../utils/validation.js";

export const listOrganizations = asyncHandler(async (req, res) => {
  const orgs = await query("SELECT * FROM client_organizations ORDER BY created_at DESC");
  res.json({ orgs });
});

export const getOrganization = asyncHandler(async (req, res) => {
  const organizationId = parseInt(req.params.organizationId, 10);
  const org = await query("SELECT * FROM client_organizations WHERE organization_id = ?", [req.params.organizationId]);

  if (!org.length) {
    throw new AppError("Organization not found", 404, "NOT_FOUND");
  }

  const clients = await query(
    `SELECT u.*, c.client_organization_id
     FROM users u
     JOIN clients c ON u.user_id = c.user_id
     WHERE c.client_organization_id = ?`,
    [organizationId]
  );

  const engagements = await query(
    `SELECT e.* FROM engagements e
     JOIN engagement_organizations eo ON e.engagement_id = eo.engagement_id
     WHERE eo.organization_id = ?`,
    [organizationId]
  );

  res.json({ organization: org[0], clients, engagements });
});

export const createOrganization = asyncHandler(async (req, res) => {
  const { name, contact_information } = req.body;

  if (!name) {
    throw new AppError("name required", 400, "VALIDATION_ERROR");
  }

  const result = await execute(
    "INSERT INTO client_organizations (name, contact_information) VALUES (?, ?)",
    [sanitizeString(name, 150), sanitizeString(contact_information, 1000)]
  );

  const org = await query("SELECT * FROM client_organizations WHERE organization_id = ?", [result.insertId]);
  res.status(201).json({ organization: org[0] });
});

export const updateOrganization = asyncHandler(async (req, res) => {
  const organizationId = parseInt(req.params.organizationId, 10);
  const { name, contact_information } = req.body;

  const org = await query("SELECT * FROM client_organizations WHERE organization_id = ?", [organizationId]);
  if (!org.length) {
    throw new AppError("Organization not found", 404, "NOT_FOUND");
  }

  await execute(
    "UPDATE client_organizations SET name = ?, contact_information = ?, updated_at = NOW() WHERE organization_id = ?",
    [sanitizeString(name, 150), sanitizeString(contact_information, 1000), organizationId]
  );

  const updated = await query("SELECT * FROM client_organizations WHERE organization_id = ?", [organizationId]);
  res.json({ organization: updated[0] });
});

export const deleteOrganization = asyncHandler(async (req, res) => {
  const organizationId = parseInt(req.params.organizationId, 10);

  const result = await execute("DELETE FROM client_organizations WHERE organization_id = ?", [organizationId]);
  if (result.affectedRows === 0) {
    throw new AppError("Organization not found", 404, "NOT_FOUND");
  }

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
