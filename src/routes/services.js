import { Router } from "express";
import { requirePentester } from "../middleware/auth.js";
import * as serviceController from "../controllers/serviceController.js";

const router = Router({ mergeParams: true });

router.get("/", serviceController.listServices);
router.post("/", requirePentester, serviceController.createService);
router.get("/:serviceId", serviceController.getService);
router.put("/:serviceId", requirePentester, serviceController.updateService);
router.delete("/:serviceId", requirePentester, serviceController.deleteService);

export default router;
