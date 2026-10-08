import { Router } from "express";
import { requirePentester } from "../middleware/auth.js";
import * as findingController from "../controllers/findingController.js";
import { asyncHandler } from "../middleware/errorHandler.js";

const router = Router({ mergeParams: true });

router.get("/", findingController.listFindings);
router.post("/", asyncHandler(requirePentester), findingController.createFinding);
router.get("/:findingId", findingController.getFinding);
router.put("/:findingId", asyncHandler(requirePentester), findingController.updateFinding);
router.delete("/:findingId", asyncHandler(requirePentester), findingController.deleteFinding);

export default router;
