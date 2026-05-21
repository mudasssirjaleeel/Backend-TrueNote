const router = require("express").Router();
const { body } = require("express-validator");
const { protect } = require("../middleware/auth");
const validate = require("../middleware/validate");
const wishlistCtrl = require("../controllers/wishlist.controller");

// All routes require authentication
router.use(protect);

// GET /api/user/wishlist - Fetch user's wishlist
router.get("/", wishlistCtrl.getWishlist);

// POST /api/user/wishlist - Add item to wishlist
router.post(
  "/",
  [
    body("type")
      .isIn(["coffee", "bean"])
      .withMessage("Type must be either 'coffee' or 'bean'"),
    body("productId")
      .if(body("type").equals("coffee"))
      .notEmpty()
      .withMessage("productId is required for coffee type"),
    body("beanId")
      .if(body("type").equals("bean"))
      .notEmpty()
      .withMessage("beanId is required for bean type"),
  ],
  validate,
  wishlistCtrl.addToWishlist,
);


// POST /api/user/wishlist/add-all-to-cart 
router.post("/add-all-to-cart", wishlistCtrl.addAllToCart);


// DELETE /api/user/wishlist/:id - Remove item from wishlist
router.delete("/:id", wishlistCtrl.removeFromWishlist);

module.exports = router;
