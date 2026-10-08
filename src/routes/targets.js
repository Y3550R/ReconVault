import { Router } from "express";
import { requirePentester } from "../middleware/auth.js";
import * as targetController from "../controllers/targetController.js";
import { asyncHandler } from "../middleware/errorHandler.js";

const router = Router({ mergeParams: true });

router.get("/", targetController.listTargets);
router.post("/", asyncHandler(requirePentester), targetController.createTarget);
router.get("/:targetId", targetController.getTarget);
router.put("/:targetId", asyncHandler(requirePentester), targetController.updateTarget);
router.delete("/:targetId", asyncHandler(requirePentester), targetController.deleteTarget);

export default router;
