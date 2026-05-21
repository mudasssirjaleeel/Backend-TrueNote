const router = require("express").Router();
const ctrl = require("../controllers/banner.controller");
const upload = require("../middleware/upload");
const { protect, adminOnly } = require("../middleware/auth");

// Public
router.get("/", ctrl.getAll);

// Admin — multer first so req.body is populated before controller
router.post(
  "/",
  protect,
  adminOnly,
  (req, res, next) => {
    req.uploadPrefix = "banner";
    next();
  },
  upload.array("images", 5),
  ctrl.create,
);

router.put(
  "/:id",
  protect,
  adminOnly,
  (req, res, next) => {
    req.uploadPrefix = "banner";
    next();
  },
  upload.array("images", 5),
  ctrl.update,
);

router.delete("/:id", protect, adminOnly, ctrl.remove);

module.exports = router;
