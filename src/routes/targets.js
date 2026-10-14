import { Router } from "express";
import { requirePentester } from "../middleware/auth.js";
import * as targetController from "../controllers/targetController.js";

const router = Router({ mergeParams: true });

router.get("/", targetController.listTargets);
router.post("/", requirePentester, targetController.createTarget);
router.get("/:targetId", targetController.getTarget);
router.put("/:targetId", requirePentester, targetController.updateTarget);
router.delete("/:targetId", requirePentester, targetController.deleteTarget);

export default router;
