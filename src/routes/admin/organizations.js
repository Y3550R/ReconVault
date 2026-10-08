import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/auth.js";
import { requireEngagementAccess } from "../../middleware/auth.js";
import * as adminOrgController from "../../controllers/adminOrgController.js";
import { asyncHandler } from "../../middleware/errorHandler.js";

const router = Router();

router.use(asyncHandler(requireAuth));
router.use(asyncHandler(requireAdmin));

// Engagement organization routes (must come before :organizationId)
router.get("/engagements/:engagementId", asyncHandler(requireEngagementAccess), adminOrgController.listEngagementOrganizations);
router.post("/engagements/:engagementId", asyncHandler(requireEngagementAccess), adminOrgController.addEngagementOrganization);
router.delete("/engagements/:engagementId/:organizationId", asyncHandler(requireEngagementAccess), adminOrgController.removeEngagementOrganization);

// Organization CRUD
router.get("/", adminOrgController.listOrganizations);
router.post("/", adminOrgController.createOrganization);
router.get("/:organizationId", adminOrgController.getOrganization);
router.put("/:organizationId", adminOrgController.updateOrganization);
router.delete("/:organizationId", adminOrgController.deleteOrganization);

export default router;
