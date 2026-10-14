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

router.get("/engagements", requirePageAuth, (req, res) => {
    res.sendFile(path.join(viewsDir, "engagements.html"));
});

router.get(
    "/admin/users",
    requirePageAuth,
    requirePageAdmin,
    (req, res) => {
        res.sendFile(path.join(viewsDir, "admin/users.html"));
    }
);

router.get(
    "/admin/organizations",
    requirePageAuth,
    requirePageAdmin,
    (req, res) => {
        res.sendFile(path.join(viewsDir, "admin/organizations.html"));
    }
);

export default router;
