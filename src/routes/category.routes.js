const router = require("express").Router();
const { body } = require("express-validator");
const ctrl = require("../controllers/category.controller");
const { protect, adminOnly } = require("../middleware/auth");
const validate = require("../middleware/validate");

// ── Public ────────────────────────────────
router.get("/", ctrl.getAll); // GET /api/categories

// ── Admin ─────────────────────────────────
router.post(
  "/",
  protect,
  adminOnly,
  [
    body("label").notEmpty().withMessage("Label is required"),
    body("slug").notEmpty().withMessage("Slug is required"),
  ],
  validate,
  ctrl.create,
);

router.put("/:id", protect, adminOnly, ctrl.update);
router.delete("/:id", protect, adminOnly, ctrl.remove);

module.exports = router;
