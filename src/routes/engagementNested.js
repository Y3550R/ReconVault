import { Router } from "express";
import { requireEngagementAccess } from "../middleware/auth.js";
import targetRoutes from "./targets.js";
import serviceRoutes from "./services.js";
import findingRoutes from "./findings.js";
import scanRoutes from "./scans.js";
import { asyncHandler } from "../middleware/errorHandler.js";

const router = Router();

// All nested routes require engagement access
router.use("/:engagementId", asyncHandler(requireEngagementAccess));

// Nested routes
router.use("/:engagementId/targets", targetRoutes);
router.use("/:engagementId/targets/:targetId/services", serviceRoutes);
router.use("/:engagementId/findings", findingRoutes);
router.use("/:engagementId/scans", scanRoutes);

export default router;
