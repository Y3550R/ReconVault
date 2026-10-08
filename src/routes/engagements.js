import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin, requirePentester } from "../middleware/auth.js";
import { requireEngagementAccess } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { AppError } from "../middleware/errorHandler.js";
import { query, execute } from "../db.js";
import * as engagementController from "../controllers/engagementController.js";

const router = Router();

router.use(asyncHandler(requireAuth));
router.use(asyncHandler(requireEngagementAccess));

router.get("/", engagementController.listEngagements);
router.post("/", asyncHandler(requireAdmin), engagementController.createEngagement);
router.get("/:engagementId", engagementController.getEngagement);
router.put("/:engagementId", asyncHandler(requireAdmin), engagementController.updateEngagement);
router.delete("/:engagementId", asyncHandler(requireAdmin), engagementController.deleteEngagement);

// Member management
router.post("/:engagementId/members", asyncHandler(requireAdmin), asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const { user_id } = req.body;
  if (!user_id) throw new AppError("user_id required", 400, "VALIDATION_ERROR");
  
  const user = await query("SELECT 1 FROM users WHERE user_id = ?", [user_id]);
  if (!user.length) throw new AppError("User not found", 404, "NOT_FOUND");
  
  await execute("INSERT IGNORE INTO engagement_members (engagement_id, user_id) VALUES (?, ?)", [engagementId, user_id]);
  res.json({ success: true });
}));

router.delete("/:engagementId/members/:userId", asyncHandler(requireAdmin), asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const userId = parseInt(req.params.userId, 10);
  await execute("DELETE FROM engagement_members WHERE engagement_id = ? AND user_id = ?", [engagementId, userId]);
  res.json({ success: true });
}));

export default router;
