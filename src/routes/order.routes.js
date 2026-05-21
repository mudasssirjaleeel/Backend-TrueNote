const router = require("express").Router();
const { body } = require("express-validator");
const ctrl = require("../controllers/order.controller");
const { protect, adminOnly } = require("../middleware/auth");
const validate = require("../middleware/validate");
const { requirePermission } = require("../middleware/permissions");

// POST /api/orders
router.post(
  "/",
  protect,
  [
    body("deliveryMethod")
      .isIn(["pickup", "delivery"])
      .withMessage("deliveryMethod must be pickup or delivery"),
    body("contactName").notEmpty().withMessage("contactName is required"),
    body("contactPhone").notEmpty().withMessage("contactPhone is required"),
    body("contactEmail")
      .isEmail()
      .withMessage("valid contactEmail is required"),
    body("addressLine")
      .if(body("deliveryMethod").equals("delivery"))
      .notEmpty()
      .withMessage("addressLine is required for delivery"),
    body("addressCity")
      .if(body("deliveryMethod").equals("delivery"))
      .notEmpty()
      .withMessage("addressCity is required for delivery"),
  ],
  validate,
  ctrl.createOrder,
);

// GET /api/orders
router.get("/", protect, ctrl.getUserOrders);

// GET /api/orders/:id
router.get("/:id", protect, ctrl.getOrder);

// GET /api/orders/:id/track  (polling fallback)
router.get("/:id/track", protect, ctrl.trackOrder);

// PATCH /api/orders/:id/status  (admin)
router.patch(
  "/:id/status",
  protect,
  adminOnly,
  [body("status").notEmpty().withMessage("status is required")],
  validate,
  ctrl.updateStatus,
);

// POST /api/orders/:id/cancel - Cancel pending order
router.post("/:id/cancel", protect, ctrl.cancelOrder);

// GET /api/orders/admin/all - Admin only - Get all orders
router.get("/admin/all", protect, adminOnly, ctrl.getAllOrders);

// GET /api/orders/admin/stats - Admin only - Get order statistics
router.get("/admin/stats", protect, adminOnly, ctrl.getOrderStats);

// GET /api/orders/admin/:id - Admin only - Get single order details
router.get("/admin/:id", protect, adminOnly, ctrl.getOrderAdmin);

// Dashboard Metrics (Admin only)
router.get(
  "/admin/metrics/overview",
  protect,
  adminOnly,
  ctrl.getOverviewMetrics,
);
router.get(
  "/admin/metrics/sales-hourly",
  protect,
  adminOnly,
  ctrl.getSalesHourly,
);
router.get(
  "/admin/metrics/channel-split",
  protect,
  adminOnly,
  ctrl.getChannelSplit,
);
router.get("/admin/orders/live", protect, adminOnly, ctrl.getLiveOrders);

module.exports = router;
