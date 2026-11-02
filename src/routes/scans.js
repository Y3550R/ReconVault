import { Router } from "express";
import { requirePentester } from "../middleware/auth.js";
import * as scanController from "../controllers/scanController.js";

const router = Router({ mergeParams: true });

router.get("/", scanController.listScans);
router.post("/", requirePentester, scanController.createScan);
router.get("/:scanId/output", scanController.getScanOutput);
router.get("/:scanId", scanController.getScan);
router.patch("/:scanId", requirePentester, scanController.updateScan);
router.post("/:scanId/start", requirePentester, scanController.startScan);
router.post("/:scanId/cancel", requirePentester, scanController.cancelScan);

export default router;
