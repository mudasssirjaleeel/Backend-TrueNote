const router = require("express").Router();
const { body } = require("express-validator");
const { protect, adminOnly, superAdminOnly } = require("../middleware/auth");
const validate = require("../middleware/validate");
const staffCtrl = require("../controllers/staff.controller");

// All routes require authentication and admin access
router.use(protect, adminOnly);

// Staff Management
router.get("/", staffCtrl.getAllStaff);
router.get("/:id", staffCtrl.getStaffById);
router.get("/:id/audit", staffCtrl.getStaffAudit);

// Invite staff (requires super admin)
router.post(
  "/invite",
  superAdminOnly,
  [
    body("email").isEmail().withMessage("Valid email required"),
    body("name").optional().isString(),
    body("role")
      .isIn(["super_admin", "manager", "barista", "counter", "rider"])
      .withMessage("Invalid role"),
    body("phone").optional().isString(),
  ],
  validate,
  staffCtrl.inviteStaff,
);

// Update staff role (requires super admin)
router.patch(
  "/:id/role",
  superAdminOnly,
  [
    body("role")
      .isIn(["super_admin", "manager", "barista", "counter", "rider"])
      .withMessage("Invalid role"),
  ],
  validate,
  staffCtrl.updateStaffRole,
);

// Activate/Deactivate
router.patch("/:id/deactivate", superAdminOnly, staffCtrl.deactivateStaff);
router.patch("/:id/activate", superAdminOnly, staffCtrl.activateStaff);

// Remove staff (requires super admin)
router.delete("/:id", superAdminOnly, staffCtrl.removeStaff);

module.exports = router;
