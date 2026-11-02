import { Router } from "express";
import { requirePentester } from "../middleware/auth.js";
import * as findingController from "../controllers/findingController.js";

const router = Router({ mergeParams: true });

router.get("/", findingController.listFindings);
router.get("/open", findingController.listOpenFindings);
router.post("/", requirePentester, findingController.createFinding);
router.get("/:findingId", findingController.getFinding);
router.put("/:findingId", requirePentester, findingController.updateFinding);
router.delete("/:findingId", requirePentester, findingController.deleteFinding);

export default router;
