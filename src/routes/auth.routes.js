const router = require("express").Router();
const { body } = require("express-validator");
const ctrl = require("../controllers/auth.controller");
const { protect, adminOnly } = require("../middleware/auth");
const validate = require("../middleware/validate");
const upload = require("../middleware/upload");

// ─────────────────────────────────────────
//  POST /api/auth/register
// ─────────────────────────────────────────
router.post(
  "/register",
  [
    body("name")
      .notEmpty()
      .withMessage("Name is required")
      .isLength({ min: 2 })
      .withMessage("Name must be at least 2 characters"),
    body("email")
      .isEmail()
      .withMessage("Valid email required")
      .normalizeEmail(),
    body("phone")
      .optional()
      .isMobilePhone()
      .withMessage("Valid phone required"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password min 6 characters"),
  ],
  validate,
  ctrl.register,
);

// ─────────────────────────────────────────
//  POST /api/auth/login
// ─────────────────────────────────────────
router.post(
  "/login",
  [
    body("email")
      .isEmail()
      .withMessage("Valid email required")
      .normalizeEmail(),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  validate,
  ctrl.login,
);

// ─────────────────────────────────────────
//  GET /api/auth/me
// ─────────────────────────────────────────
router.get("/me", protect, ctrl.getMe);

// ─────────────────────────────────────────
//  PUT /api/auth/update-profile
// ─────────────────────────────────────────
router.put(
  "/update-profile",
  protect,
  (req, res, next) => {
    req.uploadPrefix = "avatar";
    next();
  },
  upload.single("avatar"),
  ctrl.updateProfile,
);

// ─────────────────────────────────────────
//  PUT /api/auth/change-password
// ─────────────────────────────────────────
router.put("/change-password", protect, ctrl.changePassword);

// ─────────────────────────────────────────
//  POST /api/auth/logout
// ─────────────────────────────────────────
router.post("/logout", protect, ctrl.logout);

// ─────────────────────────────────────────
//  POST /api/auth/refresh
// ─────────────────────────────────────────
router.post(
  "/refresh",
  [body("refresh_token").notEmpty().withMessage("refresh_token is required")],
  validate,
  ctrl.refresh,
);

// ─────────────────────────────────────────
//  POST /api/auth/forgot-password (NEW)
// ─────────────────────────────────────────
router.post(
  "/forgot-password",
  [
    body("email")
      .isEmail()
      .withMessage("Valid email required")
      .normalizeEmail(),
  ],
  validate,
  ctrl.forgotPassword,
);

// ─────────────────────────────────────────
//  POST /api/auth/reset-password (NEW)
// ─────────────────────────────────────────
router.post(
  "/reset-password",
  [
    body("token").notEmpty().withMessage("Token is required"),
    body("newPassword")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
  ],
  validate,
  ctrl.resetPassword,
);

// ─────────────────────────────────────────
//  POST /api/auth/otp/request
// ─────────────────────────────────────────
router.post(
  "/otp/request",
  [
    body("phone")
      .notEmpty()
      .withMessage("Phone number is required")
      .isMobilePhone()
      .withMessage("Valid phone number required"),
  ],
  validate,
  ctrl.requestOtp,
);

// ─────────────────────────────────────────
//  POST /api/auth/otp/verify
// ─────────────────────────────────────────
router.post(
  "/otp/verify",
  [
    body("phone")
      .notEmpty()
      .withMessage("Phone number is required")
      .isMobilePhone()
      .withMessage("Valid phone number required"),
    body("otp")
      .notEmpty()
      .withMessage("OTP is required")
      .isLength({ min: 6, max: 6 })
      .withMessage("OTP must be 6 digits"),
  ],
  validate,
  ctrl.verifyOtp,
);

// ─────────────────────────────────────────
//  DELETE /api/auth/user/:id  (Admin only)
// ─────────────────────────────────────────
router.delete("/user/:id", protect, adminOnly, ctrl.deleteUser);

module.exports = router;
