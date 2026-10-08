import { Router } from "express";
import { requirePentester } from "../middleware/auth.js";
import * as scanController from "../controllers/scanController.js";
import { asyncHandler } from "../middleware/errorHandler.js";

const router = Router({ mergeParams: true });

router.get("/", scanController.listScans);
router.post("/", asyncHandler(requirePentester), scanController.createScan);
router.get("/:scanId", scanController.getScan);
router.post("/:scanId/start", asyncHandler(requirePentester), scanController.startScan);
router.post("/:scanId/cancel", asyncHandler(requirePentester), scanController.cancelScan);
router.delete("/:scanId", asyncHandler(requirePentester), scanController.deleteScan);

export default router;
