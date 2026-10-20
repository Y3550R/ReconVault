import { query } from "../db.js";
import { AppError, asyncHandler } from "./errorHandler.js";

export const attachUser = asyncHandler(async (req, res, next) => {
    if (req.session?.user) {
        req.user = req.session.user;
        res.locals.user = req.session.user;
    }

    next();
});

export const requireAuth = asyncHandler(async (req, res, next) => {
    if (!req.session?.user) {
        throw new AppError(
            "Authentication required",
            401,
            "AUTHENTICATION_ERROR"
        );
    }

    req.user = req.session.user;
    next();
});

export const requireAdmin = asyncHandler(async (req, res, next) => {
    if (!req.user?.roles?.isAdmin) {
        throw new AppError(
            "Administrator access required",
            403,
            "ADMIN_REQUIRED"
        );
    }

    next();
});

export const requirePentester = asyncHandler(async (req, res, next) => {
    if (!req.user?.roles?.isPentester) {
        throw new AppError(
            "Pentester access required",
            403,
            "PENTESTER_REQUIRED"
        );
    }

    next();
});

export const requireClient = asyncHandler(async (req, res, next) => {
    if (!req.user?.roles?.isClient) {
        throw new AppError(
            "Client access required",
            403,
            "CLIENT_REQUIRED"
        );
    }

    next();
});

export const requireAdminOrPentester = asyncHandler(async (req, res, next) => {
    if (!req.user?.roles?.isAdmin && !req.user?.roles?.isPentester) {
        throw new AppError(
            "Administrator or Pentester access required",
            403,
            "ADMIN_OR_PENTESTER_REQUIRED"
        );
    }

    next();
});

export const loadUserRoles = asyncHandler(async (req, res, next) => {
    if (!req.session?.user) {
        return next();
    }

    const userId = req.session.user.user_id;

    const rows = await query(
        `SELECT
    EXISTS(
      SELECT 1 FROM administrators WHERE user_id = ?
    ) AS is_admin,
    EXISTS(
      SELECT 1 FROM pentesters WHERE user_id = ?
    ) AS is_pentester,
    EXISTS(
      SELECT 1 FROM clients WHERE user_id = ?
    ) AS is_client`,
        [userId, userId, userId]
    );

    const roles = rows[0];

    req.session.user.roles = {
        isAdmin: Boolean(roles.is_admin),
        isPentester: Boolean(roles.is_pentester),
        isClient: Boolean(roles.is_client),
    };

    if (req.session.user.roles.isClient) {
        const client = await query(
            "SELECT client_organization_id FROM clients WHERE user_id = ?",
            [userId]
        );

        req.session.user.clientOrganizationId =
            client[0]?.client_organization_id ?? null;
    }

    req.user = req.session.user;
    next();
});

export const requireEngagementAccess = asyncHandler(async (req, res, next) => {
    const rawEngagementId =
        req.params.engagementId ??
        req.body.engagement_id ??
        req.query.engagement_id;

    if (rawEngagementId == null) {
        return next();
    }

    const engagementId = Number.parseInt(rawEngagementId, 10);

    if (!Number.isInteger(engagementId) || engagementId <= 0) {
        throw new AppError(
            "Invalid engagement ID",
            400,
            "INVALID_ENGAGEMENT_ID"
        );
    }

    const {
        isAdmin,
        isPentester,
        isClient,
    } = req.user.roles;
    const clientOrganizationId = req.user.clientOrganizationId;

    if (isAdmin) {
        return next();
    }

    if (isPentester) {
        const member = await query(
            `SELECT 1
      FROM engagement_members
      WHERE engagement_id = ? AND user_id = ?`,
            [engagementId, req.user.user_id]
        );

        if (!member.length) {
            throw new AppError(
                "Not a member of this engagement",
                403,
                "ENGAGEMENT_ACCESS_DENIED"
            );
        }

        return next();
    }

    if (isClient && clientOrganizationId) {
        const orgEngagement = await query(
            `SELECT 1
      FROM engagement_organizations
      WHERE engagement_id = ? AND organization_id = ?`,
            [engagementId, clientOrganizationId]
        );

        if (!orgEngagement.length) {
            throw new AppError(
                "Organization not associated with this engagement",
                403,
                "ENGAGEMENT_ACCESS_DENIED"
            );
        }

        return next();
    }

    throw new AppError(
        "No access to this engagement",
        403,
        "ENGAGEMENT_ACCESS_DENIED"
    );
});

export const authMiddleware = [attachUser, loadUserRoles];
