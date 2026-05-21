const router = require("express").Router();
const { body } = require("express-validator");
const { protect } = require("../middleware/auth");
const validate = require("../middleware/validate");
const addressCtrl = require("../controllers/address.controller");

// All routes require authentication
router.use(protect);

// GET /api/user/addresses - List all addresses
router.get("/", addressCtrl.getAddresses);

// POST /api/user/addresses - Add new address
router.post(
  "/",
  [
    body("label").notEmpty().withMessage("Label is required"),
    body("street").notEmpty().withMessage("Street is required"),
    body("city").notEmpty().withMessage("City is required"),
    body("postalCode").notEmpty().withMessage("Postal code is required"),
  ],
  validate,
  addressCtrl.addAddress,
);

// PATCH /api/user/addresses/:id - Update address
router.patch(
  "/:id",
  [
    body("label").optional(),
    body("street").optional(),
    body("city").optional(),
    body("postalCode").optional(),
    body("isDefault").optional().isBoolean(),
  ],
  validate,
  addressCtrl.updateAddress,
);

// DELETE /api/user/addresses/:id - Delete address
router.delete("/:id", addressCtrl.deleteAddress);

module.exports = router;
