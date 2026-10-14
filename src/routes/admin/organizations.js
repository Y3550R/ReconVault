import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/auth.js";
import * as adminOrgController from "../../controllers/adminOrgController.js";

const router = Router();

router.use(requireAuth);
router.use(requireAdmin);

router.get("/", adminOrgController.listOrganizations);

router.post("/", adminOrgController.createOrganization);
router.get("/:organizationId", adminOrgController.getOrganization);
router.put("/:organizationId", adminOrgController.updateOrganization);

export default router;
