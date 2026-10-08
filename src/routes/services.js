import { Router } from "express";
import { requirePentester } from "../middleware/auth.js";
import * as serviceController from "../controllers/serviceController.js";
import { asyncHandler } from "../middleware/errorHandler.js";

const router = Router({ mergeParams: true });

router.get("/", serviceController.listServices);
router.post("/", asyncHandler(requirePentester), serviceController.createService);
router.get("/:serviceId", serviceController.getService);
router.put("/:serviceId", asyncHandler(requirePentester), serviceController.updateService);
router.delete("/:serviceId", asyncHandler(requirePentester), serviceController.deleteService);

export default router;
