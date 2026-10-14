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
