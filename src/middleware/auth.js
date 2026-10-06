import { query } from "../db.js";
import { AppError, asyncHandler } from "./errorHandler.js";

export function attachUser(req, res, next) {
  if (req.session?.user) {
    req.user = req.session.user;
    res.locals.user = req.session.user;
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.session?.user) {
    throw new AppError("Authentication required", 401, "AUTHENTICATION_ERROR");
  }
  req.user = req.session.user;
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user?.roles?.isAdmin) {
    throw new AppError("Administrator access required", 403, "ADMIN_REQUIRED");
  }
  next();
}

export function requirePentester(req, res, next) {
  if (!req.user?.roles?.isPentester) {
    throw new AppError("Pentester access required", 403, "PENTESTER_REQUIRED");
  }
  next();
}

export function requireClient(req, res, next) {
  if (!req.user?.roles?.isClient) {
    throw new AppError("Client access required", 403, "CLIENT_REQUIRED");
  }
  next();
}

export function requireAdminOrPentester(req, res, next) {
  if (!req.user?.roles?.isAdmin && !req.user?.roles?.isPentester) {
    throw new AppError("Administrator or Pentester access required", 403, "ADMIN_OR_PENTESTER_REQUIRED");
  }
  next();
}

export async function loadUserRoles(req, res, next) {
  if (!req.session?.user) return next();

  const rows = await query(
    `SELECT
       EXISTS(SELECT 1 FROM administrators WHERE user_id = ?) AS is_admin,
       EXISTS(SELECT 1 FROM pentesters WHERE user_id = ?) AS is_pentester,
       EXISTS(SELECT 1 FROM clients WHERE user_id = ?) AS is_client
     `,
    [req.session.user.user_id, req.session.user.user_id, req.session.user.user_id]
  );

  const roles = rows[0];
  req.session.user.roles = {
    isAdmin: Boolean(roles.is_admin),
    isPentester: Boolean(roles.is_pentester),
    isClient: Boolean(roles.is_client),
  };

  if (req.session.user.roles.isClient) {
    const client = await query("SELECT client_organization_id FROM clients WHERE user_id = ?", [req.session.user.user_id]);
    req.session.user.clientOrganizationId = client[0]?.client_organization_id ?? null;
  }

  req.user = req.session.user;
  next();
}

export async function requireEngagementAccess(req, res, next) {
  const engagementId = parseInt(req.params.engagementId ?? req.body.engagement_id ?? req.query.engagement_id, 10);
  if (!engagementId) return next();

  const { isAdmin, isPentester, isClient, clientOrganizationId } = req.user.roles;

  if (isAdmin) return next();

  if (isPentester) {
    const member = await query("SELECT 1 FROM engagement_members WHERE engagement_id = ? AND user_id = ?", [engagementId, req.user.user_id]);
    if (!member.length) throw new AppError("Not a member of this engagement", 403, "ENGAGEMENT_ACCESS_DENIED");
    return next();
  }

  if (isClient && clientOrganizationId) {
    const orgEngagement = await query("SELECT 1 FROM engagement_organizations WHERE engagement_id = ? AND organization_id = ?", [engagementId, clientOrganizationId]);
    if (!orgEngagement.length) throw new AppError("Organization not associated with this engagement", 403, "ENGAGEMENT_ACCESS_DENIED");
    return next();
  }

  throw new AppError("No access to this engagement", 403, "ENGAGEMENT_ACCESS_DENIED");
}

export async function getAccessibleEngagements(user) {
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

export const authMiddleware = [attachUser, loadUserRoles];