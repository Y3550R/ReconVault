import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const viewsDir = path.resolve(__dirname, "../../views");

function requirePageAuth(req, res, next) {
    if (!req.session?.user) {
        return res.redirect("/login");
    }

    next();
}

function requirePageAdmin(req, res, next) {
    if (!req.user?.roles?.isAdmin) {
        return res.redirect("/engagements");
    }

    next();
}

router.get("/", (req, res) => {
    if (req.session?.user) {
        return res.redirect("/engagements");
    }

    res.redirect("/login");
});

router.get("/login", (req, res) => {
    if (req.session?.user) {
        return res.redirect("/engagements");
    }

    res.sendFile(path.join(viewsDir, "login.html"));
});

// Engagement list
router.get("/engagements", requirePageAuth, (req, res) => {
    res.sendFile(path.join(viewsDir, "engagements.html"));
});

// Engagement dashboard
router.get(
    "/engagements/:engagementId",
    requirePageAuth,
    (req, res) => {
        res.sendFile(
            path.join(viewsDir, "engagements/engagement-dashboard.html")
        );
    }
);

// Engagement members
router.get(
    "/engagements/:engagementId/members",
    requirePageAuth,
    requirePageAdmin,
    (req, res) => {
        res.sendFile(
            path.join(viewsDir, "engagements/members.html")
        );
    }
);

// Engagement targets list
router.get(
    "/engagements/:engagementId/targets",
    requirePageAuth,
    (req, res) => {
        res.sendFile(path.join(viewsDir, "engagements/targets.html"));
    }
);

// Target details
router.get(
    "/engagements/:engagementId/targets/:targetId",
    requirePageAuth,
    (req, res) => {
        res.sendFile(
            path.join(viewsDir, "engagements/target-details.html")
        );
    }
);

// Service details
router.get(
    "/engagements/:engagementId/targets/:targetId/services/:serviceId",
    requirePageAuth,
    (req, res) => {
        res.sendFile(
            path.join(viewsDir, "engagements/service-details.html")
        );
    }
);

// Engagement findings list
router.get(
    "/engagements/:engagementId/findings",
    requirePageAuth,
    (req, res) => {
        res.sendFile(path.join(viewsDir, "engagements/findings.html"));
    }
);

// Finding details
router.get(
    "/engagements/:engagementId/findings/:findingId",
    requirePageAuth,
    (req, res) => {
        res.sendFile(
            path.join(viewsDir, "engagements/finding-details.html")
        );
    }
);

// Engagement scans
router.get(
    "/engagements/:engagementId/scans",
    requirePageAuth,
    (req, res) => {
        res.sendFile(path.join(viewsDir, "engagements/scans.html"));
    }
);

// Admin users
router.get(
    "/admin/users",
    requirePageAuth,
    requirePageAdmin,
    (req, res) => {
        res.sendFile(path.join(viewsDir, "admin/users.html"));
    }
);

// Admin organizations
router.get(
    "/admin/organizations",
    requirePageAuth,
    requirePageAdmin,
    (req, res) => {
        res.sendFile(path.join(viewsDir, "admin/organizations.html"));
    }
);

export default router;
