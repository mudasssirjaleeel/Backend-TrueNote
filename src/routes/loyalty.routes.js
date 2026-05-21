const router = require("express").Router();
const { body } = require("express-validator");
const { protect, adminOnly } = require("../middleware/auth");
const validate = require("../middleware/validate");
const loyaltyCtrl = require("../controllers/loyalty.controller");

// ─────────────────────────────────────────
//  USER ROUTES (require authentication)
// ─────────────────────────────────────────

// User loyalty endpoints
router.get("/", protect, loyaltyCtrl.getLoyaltyInfo);
router.get("/earn-actions", protect, loyaltyCtrl.getEarnActions);
router.post(
  "/redeem",
  protect,
  [body("reward_id").notEmpty().withMessage("reward_id is required")],
  validate,
  loyaltyCtrl.redeemReward,
);

// ─────────────────────────────────────────
//  ADMIN ROUTES (require authentication + admin role)
// ─────────────────────────────────────────

// User management
router.get(
  "/admin/users",
  protect,
  adminOnly,
  loyaltyCtrl.adminGetAllUsersLoyalty,
);
router.get(
  "/admin/users/:userId",
  protect,
  adminOnly,
  loyaltyCtrl.adminGetUserLoyalty,
);
router.post(
  "/admin/users/:userId/points",
  protect,
  adminOnly,
  [
    body("points").isInt().withMessage("Points must be an integer"),
    body("reason").optional().isString(),
  ],
  validate,
  loyaltyCtrl.adminAdjustPoints,
);

// Rewards management
router.get("/admin/rewards", protect, adminOnly, loyaltyCtrl.adminGetRewards);
router.post(
  "/admin/rewards",
  protect,
  adminOnly,
  [
    body("title").notEmpty().withMessage("Title is required"),
    body("pointsCost").isInt().withMessage("Points cost must be an integer"),
    body("description").optional(),
    body("isActive").optional().isBoolean(),
  ],
  validate,
  loyaltyCtrl.adminCreateReward,
);
router.put(
  "/admin/rewards/:rewardId",
  protect,
  adminOnly,
  [
    body("title").optional(),
    body("pointsCost").optional().isInt(),
    body("description").optional(),
    body("isActive").optional().isBoolean(),
  ],
  validate,
  loyaltyCtrl.adminUpdateReward,
);
router.delete(
  "/admin/rewards/:rewardId",
  protect,
  adminOnly,
  loyaltyCtrl.adminDeleteReward,
);

// Earn actions management
router.get(
  "/admin/earn-actions",
  protect,
  adminOnly,
  loyaltyCtrl.adminGetEarnActions,
);
router.post(
  "/admin/earn-actions",
  protect,
  adminOnly,
  [
    body("title").notEmpty().withMessage("Title is required"),
    body("pointsEarned")
      .isInt()
      .withMessage("Points earned must be an integer"),
    body("actionKey").notEmpty().withMessage("Action key is required"),
    body("maxPerUser").optional().isInt(),
    body("isActive").optional().isBoolean(),
  ],
  validate,
  loyaltyCtrl.adminCreateEarnAction,
);
router.put(
  "/admin/earn-actions/:actionId",
  protect,
  adminOnly,
  [
    body("title").optional(),
    body("pointsEarned").optional().isInt(),
    body("actionKey").optional(),
    body("maxPerUser").optional().isInt(),
    body("isActive").optional().isBoolean(),
  ],
  validate,
  loyaltyCtrl.adminUpdateEarnAction,
);
router.delete(
  "/admin/earn-actions/:actionId",
  protect,
  adminOnly,
  loyaltyCtrl.adminDeleteEarnAction,
);

module.exports = router;
