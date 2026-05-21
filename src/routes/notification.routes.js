const router = require("express").Router();
const { body } = require("express-validator");
const { protect } = require("../middleware/auth");
const validate = require("../middleware/validate");
const notificationCtrl = require("../controllers/notification.controller");

// All routes require authentication
router.use(protect);

// Device token management
router.post(
  "/register-token",
  [
    body("token").notEmpty().withMessage("Device token is required"),
    body("deviceType").optional().isIn(["ios", "android", "web"]),
  ],
  validate,
  notificationCtrl.registerDeviceToken,
);

router.post("/unregister-token", notificationCtrl.unregisterDeviceToken);

// Notification endpoints
router.get("/", notificationCtrl.getUserNotifications);
router.get("/unread-count", notificationCtrl.getUnreadCount);
router.patch("/:id/read", notificationCtrl.markAsRead);
router.post("/mark-all-read", notificationCtrl.markAllAsRead);

module.exports = router;
