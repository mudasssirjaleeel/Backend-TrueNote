const router = require("express").Router();
const { body } = require("express-validator");
const ctrl = require("../controllers/cart.controller");
const { protect } = require("../middleware/auth");
const validate = require("../middleware/validate");

// GET /api/cart
router.get("/", protect, ctrl.getCart);

// POST /api/cart/items
router.post(
  "/items",
  protect,
  [
    body("type")
      .isIn(["coffee", "bean"])
      .withMessage("type must be coffee or bean"),
    body("quantity")
      .optional()
      .isInt({ min: 1 })
      .withMessage("quantity must be at least 1"),
  ],
  validate,
  ctrl.addItem,
);

// PATCH /api/cart/items/:id
router.patch(
  "/items/:id",
  protect,
  [
    body("quantity")
      .isInt({ min: 0 })
      .withMessage("quantity must be 0 or greater"),
  ],
  validate,
  ctrl.updateItem,
);

// DELETE /api/cart/items/:id
router.delete("/items/:id", protect, ctrl.removeItem);

// DELETE /api/cart
router.delete("/", protect, ctrl.clearCart);

module.exports = router;
