const router = require("express").Router();
const { body } = require("express-validator");
const ctrl = require("../controllers/auth.controller");
const { protect } = require("../middleware/auth");
const validate = require("../middleware/validate");
const upload = require("../middleware/upload");

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

router.get("/me", protect, ctrl.getMe);
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

router.put("/change-password", protect, ctrl.changePassword);
router.post("/logout", protect, ctrl.logout);
router.post(
  "/refresh",
  [body("refresh_token").notEmpty().withMessage("refresh_token is required")],
  validate,
  ctrl.refresh,
);

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

router.delete("/user/:id", protect, ctrl.deleteUser);

module.exports = router;
