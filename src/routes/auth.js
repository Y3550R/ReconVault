import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import * as authController from "../controllers/authController.js";
import { asyncHandler } from "../middleware/errorHandler.js";

const router = Router();

router.post("/login", authController.login);
router.post("/logout", authController.logout);
router.get("/me", asyncHandler(requireAuth), authController.me);

export default router;
