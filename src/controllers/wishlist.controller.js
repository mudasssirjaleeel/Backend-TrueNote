const prisma = require("../config/prisma");
const asyncHandler = require("../utils/asyncHandler");

// ─────────────────────────────────────────
//  GET /api/user/wishlist
// ─────────────────────────────────────────
exports.getWishlist = asyncHandler(async (req, res) => {
  const wishlistItems = await prisma.wishlistItem.findMany({
    where: { userId: req.user.id },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          subtitle: true,
          description: true,
          price: true,
          imageUrl: true,
          imageUrls: true,
          isAvailable: true,
          categoryId: true,
        },
      },
      bean: {
        select: {
          id: true,
          name: true,
          origin: true,
          weight: true,
          price: true,
          imageUrl: true,
          imageUrls: true,
          description: true,
          isDark: true,
          isAvailable: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Format the response to include type field
  const formattedItems = wishlistItems
    .map((item) => {
      if (item.product) {
        return {
          ...item.product,
          type: "coffee",
          wishlistId: item.id,
          addedAt: item.createdAt,
        };
      } else if (item.bean) {
        return {
          ...item.bean,
          type: "bean",
          wishlistId: item.id,
          addedAt: item.createdAt,
        };
      }
      return null;
    })
    .filter((item) => item !== null);

  res.status(200).json({ wishlist: formattedItems });
});

// ─────────────────────────────────────────
//  POST /api/user/wishlist
// ─────────────────────────────────────────
exports.addToWishlist = asyncHandler(async (req, res) => {
  const { productId, beanId, type } = req.body;

  // Validate input
  if (!type || (type !== "coffee" && type !== "bean")) {
    return res.status(400).json({
      error: {
        code: "INVALID_TYPE",
        message: "Type must be either 'coffee' or 'bean'",
      },
    });
  }

  if (type === "coffee" && !productId) {
    return res.status(400).json({
      error: {
        code: "MISSING_PRODUCT_ID",
        message: "productId is required for coffee type",
      },
    });
  }

  if (type === "bean" && !beanId) {
    return res.status(400).json({
      error: {
        code: "MISSING_BEAN_ID",
        message: "beanId is required for bean type",
      },
    });
  }

  // Check if item exists
  if (type === "coffee") {
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      return res.status(404).json({
        error: {
          code: "PRODUCT_NOT_FOUND",
          message: "Product not found",
        },
      });
    }
  } else {
    const bean = await prisma.bean.findUnique({
      where: { id: beanId },
    });
    if (!bean) {
      return res.status(404).json({
        error: {
          code: "BEAN_NOT_FOUND",
          message: "Bean not found",
        },
      });
    }
  }

  // Check if already in wishlist
  let existingItem;
  if (type === "coffee") {
    existingItem = await prisma.wishlistItem.findUnique({
      where: {
        userId_productId: {
          userId: req.user.id,
          productId: productId,
        },
      },
    });
  } else {
    existingItem = await prisma.wishlistItem.findUnique({
      where: {
        userId_beanId: {
          userId: req.user.id,
          beanId: beanId,
        },
      },
    });
  }

  if (existingItem) {
    return res.status(409).json({
      error: {
        code: "ALREADY_IN_WISHLIST",
        message: "Item already in wishlist",
      },
    });
  }

  // Add to wishlist
  const wishlistItem = await prisma.wishlistItem.create({
    data: {
      type: type === "coffee" ? "coffee" : "bean",
      userId: req.user.id,
      productId: type === "coffee" ? productId : null,
      beanId: type === "bean" ? beanId : null,
    },
  });

  res.status(200).json({ success: true, wishlistId: wishlistItem.id });
});

// ─────────────────────────────────────────
//  DELETE /api/user/wishlist/:id
// ─────────────────────────────────────────
exports.removeFromWishlist = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Check if wishlist item exists and belongs to user
  const wishlistItem = await prisma.wishlistItem.findFirst({
    where: {
      id: id,
      userId: req.user.id,
    },
  });

  if (!wishlistItem) {
    return res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Wishlist item not found",
      },
    });
  }

  // Delete the item
  await prisma.wishlistItem.delete({
    where: { id: id },
  });

  res.status(200).json({ success: true });
});



// ─────────────────────────────────────────
//  POST /api/user/wishlist/add-all-to-cart
//  Add all wishlist items to cart
// ─────────────────────────────────────────
exports.addAllToCart = asyncHandler(async (req, res) => {
  // Get all wishlist items
  const wishlistItems = await prisma.wishlistItem.findMany({
    where: { userId: req.user.id },
    include: {
      product: {
        include: {
          variants: true,
          sizes: true,
        },
      },
      bean: {
        include: {
          grindOptions: true,
          purchasePlans: true,
        },
      },
    },
  });

  if (wishlistItems.length === 0) {
    return res.status(400).json({
      error: {
        code: "EMPTY_WISHLIST",
        message: "Your wishlist is empty",
      },
    });
  }

  const addedItems = [];

  for (const item of wishlistItems) {
    if (item.product) {
      // Coffee product - use default variant/size if available
      const defaultVariant = item.product.variants[0];
      const defaultSize = item.product.sizes[0];
      
      // Check if already in cart
      const existing = await prisma.cartItem.findFirst({
        where: {
          userId: req.user.id,
          type: "coffee",
          productId: item.productId,
          variantId: defaultVariant?.id || null,
          sizeId: defaultSize?.id || null,
        },
      });

      if (existing) {
        // Increment quantity
        await prisma.cartItem.update({
          where: { id: existing.id },
          data: { quantity: { increment: 1 } },
        });
        addedItems.push({ ...item.product, quantity: existing.quantity + 1 });
      } else {
        // Add new item
        const unitPrice = defaultSize?.price || defaultVariant?.price || item.product.price;
        const cartItem = await prisma.cartItem.create({
          data: {
            userId: req.user.id,
            type: "coffee",
            quantity: 1,
            unitPrice: Number(unitPrice),
            productId: item.productId,
            variantId: defaultVariant?.id || null,
            sizeId: defaultSize?.id || null,
          },
        });
        addedItems.push({ ...item.product, quantity: 1 });
      }
    } 
    else if (item.bean) {
      // Bean product - use default grind option
      const defaultGrind = item.bean.grindOptions[0];
      const defaultPlan = item.bean.purchasePlans.find(p => p.plan === "one_time");
      
      // Check if already in cart
      const existing = await prisma.cartItem.findFirst({
        where: {
          userId: req.user.id,
          type: "bean",
          beanId: item.beanId,
          grindId: defaultGrind?.id || null,
          planId: defaultPlan?.id || null,
        },
      });

      let unitPrice = Number(item.bean.price);
      if (defaultPlan?.discount) {
        unitPrice = unitPrice - (unitPrice * Number(defaultPlan.discount)) / 100;
      }

      if (existing) {
        await prisma.cartItem.update({
          where: { id: existing.id },
          data: { quantity: { increment: 1 } },
        });
        addedItems.push({ ...item.bean, quantity: existing.quantity + 1 });
      } else {
        await prisma.cartItem.create({
          data: {
            userId: req.user.id,
            type: "bean",
            quantity: 1,
            unitPrice,
            beanId: item.beanId,
            grindId: defaultGrind?.id || null,
            planId: defaultPlan?.id || null,
          },
        });
        addedItems.push({ ...item.bean, quantity: 1 });
      }
    }
  }

  res.status(200).json({
    success: true,
    message: `${addedItems.length} item(s) added to cart`,
    added_items: addedItems.map(i => ({ name: i.name, quantity: i.quantity })),
  });
});