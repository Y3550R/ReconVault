import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/auth.js";
import { requireEngagementAccess } from "../middleware/auth.js";
import * as engagementController from "../controllers/engagementController.js";

const router = Router();

router.use(requireAuth);
router.use(requireEngagementAccess);

router.get("/", engagementController.listEngagements);
router.post("/", requireAdmin, engagementController.createEngagement);
router.get("/:engagementId", engagementController.getEngagement);
router.put("/:engagementId", requireAdmin, engagementController.updateEngagement);
router.delete("/:engagementId", requireAdmin, engagementController.deleteEngagement);

// Member management
router.get("/:engagementId/members", requireAdmin, engagementController.listEngagementMembers);
router.post("/:engagementId/members", requireAdmin, engagementController.addEngagementMember);
router.delete("/:engagementId/members/:userId", requireAdmin, engagementController.removeEngagementMember);

// Organization management
router.get("/:engagementId/organizations", requireAdmin, engagementController.listEngagementOrganizations);
router.post("/:engagementId/organizations", requireAdmin, engagementController.addEngagementOrganization);
router.delete("/:engagementId/organizations/:organizationId", requireAdmin, engagementController.removeEngagementOrganization);

export default router;
