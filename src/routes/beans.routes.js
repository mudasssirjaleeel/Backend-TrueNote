const router = require("express").Router();
const { body } = require("express-validator");
const ctrl = require("../controllers/bean.controller");
const upload = require("../middleware/upload");
const { protect, adminOnly } = require("../middleware/auth");
const validate = require("../middleware/validate");

// Public
router.get("/", ctrl.getAll);
router.get("/:id", ctrl.getOne);
router.get("/filters", ctrl.getFilters);

// Admin — multer first, then validators
router.post(
  "/",
  protect,
  adminOnly,
  (req, res, next) => {
    req.uploadPrefix = "bean";
    next();
  },
  upload.array("images", 5),
  [
    body("name").notEmpty().withMessage("Name is required"),
    body("origin").notEmpty().withMessage("Origin is required"),
    body("weight").notEmpty().withMessage("Weight is required"),
    body("price").notEmpty().withMessage("Valid price required"),
  ],
  validate,
  ctrl.create,
);

router.put(
  "/:id",
  protect,
  adminOnly,
  (req, res, next) => {
    req.uploadPrefix = "bean";
    next();
  },
  upload.array("images", 5),
  ctrl.update,
);

router.delete("/:id", protect, adminOnly, ctrl.remove);


router.patch(
  "/:id/availability",
  protect,
  adminOnly,
  ctrl.toggleAvailability
);

router.get(
  "/admin/list",
  protect,
  adminOnly,
  ctrl.adminList
);



module.exports = router;
