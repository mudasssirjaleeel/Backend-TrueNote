const router = require("express").Router();
const { body } = require("express-validator");
const ctrl = require("../controllers/product.controller");
const { protect, adminOnly } = require("../middleware/auth");
const validate = require("../middleware/validate");
const upload = require("../middleware/upload");

// ── Public ────────────────────────────────
router.get("/", ctrl.getAll); // GET /api/products?search=&category=
router.get("/:id", ctrl.getOne); // GET /api/products/:id
// ── Mobile Menu Routes (Public) ───────────
router.get("/menu/today", ctrl.getTodayMenu);
router.get("/menu/categories", ctrl.getMenuCategories);
router.get("/menu/items/:id", ctrl.getMenuItem);


// ── Admin ─────────────────────────────────
router.post(
  "/",
  protect,
  adminOnly,
  (req, res, next) => {
    req.uploadPrefix = "product";
    next();
  },
  upload.array("images", 5),
  [
    body("name").notEmpty().withMessage("Name is required"),
    body("price").isFloat({ gt: 0 }).withMessage("Valid price required"),
    body("categoryId")
      .optional()
      .isUUID()
      .withMessage("Valid categoryId required"),
  ],
  validate,
  ctrl.create,
);

router.put(
  "/:id",
  protect,
  adminOnly,
  (req, res, next) => {
    req.uploadPrefix = "product";
    next();
  },
  upload.array("images", 5),
  ctrl.update,
);
router.delete("/:id", protect, adminOnly, ctrl.remove);


// ── Admin Menu Routes ─────────────────────
router.patch(
  "/admin/menu/items/:id/availability",
  protect,
  adminOnly,
  ctrl.toggleItemAvailability
);

router.patch(
  "/admin/menu/items/:id/special",
  protect,
  adminOnly,
  ctrl.setDailySpecial
);


module.exports = router;
