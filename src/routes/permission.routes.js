const router = require("express").Router();
const { protect } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");
const staffCtrl = require("../controllers/staff.controller");

// All routes require authentication
router.use(protect);

// Permission management (Super Admin only)
router.get(
  "/roles",
  requirePermission("manage_staff_roles"),
  staffCtrl.getAllRolesWithPermissions,
);

router.get(
  "/all",
  requirePermission("manage_staff_roles"),
  staffCtrl.getAllPermissions,
);

router.put(
  "/roles/:role",
  requirePermission("manage_staff_roles"),
  staffCtrl.updateRolePermissions,
);

module.exports = router;
