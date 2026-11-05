import { query, execute, transaction, callProcedure } from "../db.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";
import { validateEnum, sanitizeString } from "../utils/validation.js";
import { attachContributors } from "../services/contributors.js";

export const listFindings = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);

  const [findings = []] = await callProcedure("sp_get_engagement_findings", [
    engagementId,
  ]);

  await attachContributors("findings", findings);

  res.json({ findings });
});

export const listOpenFindings = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const rawSeverity = req.query.severity;
  const severity =
    rawSeverity === undefined || rawSeverity === ""
      ? null
      : String(rawSeverity).toUpperCase();

  if (severity && !validateEnum(severity, ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"])) {
    throw new AppError("Invalid severity", 400, "VALIDATION_ERROR");
  }

  const [findings = []] = await callProcedure("sp_get_open_findings", [
    engagementId,
    severity,
  ]);

  await attachContributors("findings", findings);

  res.json({ findings });
});

export const getFinding = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const findingId = parseInt(req.params.findingId, 10);

  const finding = await query("SELECT * FROM findings WHERE finding_id = ? AND engagement_id = ?", [findingId, engagementId]);
  if (!finding.length) {
    throw new AppError("Finding not found", 404, "NOT_FOUND");
  }

  const targetLinks = await query(
    `SELECT t.* FROM targets t
     JOIN finding_targets ft ON t.target_id = ft.target_id
     WHERE ft.finding_id = ?`,
    [findingId]
  );

  const serviceLinks = await query(
    `SELECT s.*, t.ip_address FROM services s
     JOIN finding_services fs ON s.service_id = fs.service_id
     JOIN targets t ON s.target_id = t.target_id
     WHERE fs.finding_id = ?`,
    [findingId]
  );

  await attachContributors("findings", finding);
  await attachContributors("targets", targetLinks);
  await attachContributors("services", serviceLinks);

  res.json({ finding: finding[0], targets: targetLinks, services: serviceLinks });
});

export const createFinding = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const { title, description, severity, status, target_ids, service_ids, references, cvss_vector, remediation } = req.body;

  if (!title || !description || !severity) {
    throw new AppError("title, description, and severity required", 400, "VALIDATION_ERROR");
  }

  if (!validateEnum(severity, ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"])) {
    throw new AppError("Invalid severity", 400, "VALIDATION_ERROR");
  }

  if (status && !validateEnum(status, ["OPEN", "IN PROGRESS", "RESOLVED", "ACCEPTED"])) {
    throw new AppError("Invalid status", 400, "VALIDATION_ERROR");
  }

  if (!target_ids?.length && !service_ids?.length) {
    throw new AppError("At least one target or service required", 400, "VALIDATION_ERROR");
  }

  const findingId = await transaction(async (conn) => {
    // Triggers read the session variable from the connection running the
    // write, so set it on the transaction connection and reset it before the
    // connection is returned to the pool.
    await conn.execute("SET @current_user_id = ?", [req.user.user_id]);

    try {
      const [result] = await conn.execute(
        `INSERT INTO findings (engagement_id, title, description, severity, status, creator_user_id, \`references\`, cvss_vector, remediation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          engagementId,
          sanitizeString(title, 200),
          sanitizeString(description, 5000),
          severity,
          status || "OPEN",
          req.user.user_id,
          sanitizeString(references, 2000),
          sanitizeString(cvss_vector, 100),
          sanitizeString(remediation, 5000),
        ]
      );

      const newFindingId = result.insertId;

      if (target_ids?.length) {
        for (const tid of target_ids) {
          await conn.execute("INSERT INTO finding_targets (finding_id, target_id) VALUES (?, ?)", [newFindingId, tid]);
        }
      }

      if (service_ids?.length) {
        for (const sid of service_ids) {
          await conn.execute("INSERT INTO finding_services (finding_id, service_id) VALUES (?, ?)", [newFindingId, sid]);
        }
      }

      return newFindingId;
    } finally {
      await conn.execute("SET @current_user_id = NULL");
    }
  });

  const finding = await query("SELECT * FROM findings WHERE finding_id = ?", [findingId]);
  await attachContributors("findings", finding);
  res.status(201).json({ finding: finding[0] });
});

export const updateFinding = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const findingId = parseInt(req.params.findingId, 10);
  const { title, description, severity, status, target_ids, service_ids, references, cvss_vector, remediation, resolved_at } = req.body;

  const finding = await query("SELECT * FROM findings WHERE finding_id = ? AND engagement_id = ?", [findingId, engagementId]);
  if (!finding.length) {
    throw new AppError("Finding not found", 404, "NOT_FOUND");
  }

  if (severity && !validateEnum(severity, ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"])) {
    throw new AppError("Invalid severity", 400, "VALIDATION_ERROR");
  }

  if (status && !validateEnum(status, ["OPEN", "IN PROGRESS", "RESOLVED", "ACCEPTED"])) {
    throw new AppError("Invalid status", 400, "VALIDATION_ERROR");
  }

  if (target_ids?.length === 0 && service_ids?.length === 0) {
    throw new AppError("At least one target or service required", 400, "VALIDATION_ERROR");
  }

  await transaction(async (conn) => {
    await conn.execute("SET @current_user_id = ?", [req.user.user_id]);

    try {
      await conn.execute(
        `UPDATE findings SET title = ?, description = ?, severity = ?, status = ?, \`references\` = ?, cvss_vector = ?, remediation = ?, resolved_at = ?, updated_at = NOW()
         WHERE finding_id = ?`,
        [
          sanitizeString(title, 200),
          sanitizeString(description, 5000),
          severity || finding[0].severity,
          status || finding[0].status,
          sanitizeString(references, 2000),
          sanitizeString(cvss_vector, 100),
          sanitizeString(remediation, 5000),
          resolved_at || null,
          findingId,
        ]
      );

      if (target_ids) {
        await conn.execute("DELETE FROM finding_targets WHERE finding_id = ?", [findingId]);
        for (const tid of target_ids) {
          await conn.execute("INSERT INTO finding_targets (finding_id, target_id) VALUES (?, ?)", [findingId, tid]);
        }
      }

      if (service_ids) {
        await conn.execute("DELETE FROM finding_services WHERE finding_id = ?", [findingId]);
        for (const sid of service_ids) {
          await conn.execute("INSERT INTO finding_services (finding_id, service_id) VALUES (?, ?)", [findingId, sid]);
        }
      }
    } finally {
      await conn.execute("SET @current_user_id = NULL");
    }
  });

  const updated = await query("SELECT * FROM findings WHERE finding_id = ?", [findingId]);
  await attachContributors("findings", updated);
  res.json({ finding: updated[0] });
});

export const deleteFinding = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const findingId = parseInt(req.params.findingId, 10);

  const result = await execute("DELETE FROM findings WHERE finding_id = ? AND engagement_id = ?", [findingId, engagementId]);
  if (result.affectedRows === 0) {
    throw new AppError("Finding not found", 404, "NOT_FOUND");
  }

  res.json({ success: true });
});