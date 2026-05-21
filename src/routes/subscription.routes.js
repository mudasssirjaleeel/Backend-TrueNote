const router = require("express").Router();
const { body } = require("express-validator");
const { protect, adminOnly } = require("../middleware/auth");
const validate = require("../middleware/validate");
const subscriptionCtrl = require("../controllers/subscription.controller");

// All routes require authentication
router.use(protect);

// ─────────────────────────────────────────
//  ADMIN ROUTES (must come FIRST)
// ─────────────────────────────────────────
router.get("/admin/all", protect, adminOnly, subscriptionCtrl.adminGetAllSubscriptions);
router.get("/admin/upcoming", protect, adminOnly, subscriptionCtrl.adminGetUpcomingRenewals);
router.get("/admin/stats", protect, adminOnly, subscriptionCtrl.adminGetSubscriptionStats);

// ─────────────────────────────────────────
//  CUSTOMER ROUTES
// ─────────────────────────────────────────
router.get("/", subscriptionCtrl.getSubscriptions);

router.post(
  "/",
  [
    body("deliveryPlan").isIn(["weekly", "biweekly", "monthly"]),
    body("price").isFloat({ min: 0 }),
    body("productId").optional().isString(),
    body("beanId").optional().isString(),
    body("grindOptionId").optional().isString(),
  ],
  validate,
  subscriptionCtrl.createSubscription,
);

// Action routes
router.patch("/:id/pause", subscriptionCtrl.togglePauseSubscription);
router.post("/:id/pause", subscriptionCtrl.pauseSubscription);
router.post("/:id/resume", subscriptionCtrl.resumeSubscription);
router.patch("/:id/skip", subscriptionCtrl.skipNextDelivery);
router.delete("/:id", subscriptionCtrl.cancelSubscription);

// GET /:id - MUST BE LAST
router.get("/:id", subscriptionCtrl.getSubscriptionById);

module.exports = router;