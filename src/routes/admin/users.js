import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/auth.js";
import * as adminUserController from "../../controllers/adminUserController.js";

const router = Router();

router.use(requireAuth);
router.use(requireAdmin);

router.get("/", adminUserController.listUsers);

router.post("/", adminUserController.createUser);
router.get("/:userId", adminUserController.getUser);
router.put("/:userId", adminUserController.updateUser);

router.get("/:userId/roles", adminUserController.listRoles);
router.post("/:userId/roles", adminUserController.addRole);
router.delete("/:userId/roles", adminUserController.removeRole);

router.get("/:userId/organization", adminUserController.getOrganization);
router.put("/:userId/organization", adminUserController.changeOrganization);

export default router;
