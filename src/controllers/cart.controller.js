const prisma = require("../config/prisma");
const asyncHandler = require("../utils/asyncHandler");

// ─────────────────────────────────────────
//  Helper — fetch full cart with total
// ─────────────────────────────────────────
const getFullCart = async (userId) => {
  const items = await prisma.cartItem.findMany({
    where: { userId },
    include: {
      product: {
        select: { id: true, name: true, imageUrl: true, price: true },
      },
      variant: { select: { id: true, name: true, price: true } },
      size: { select: { id: true, label: true, price: true } },
      bean: {
        select: {
          id: true,
          name: true,
          origin: true,
          imageUrl: true,
          price: true,
          weight: true,
        },
      },
      grind: { select: { id: true, grind: true } },
      plan: {
        select: { id: true, plan: true, discount: true, description: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Calculate total — unitPrice * quantity per item
  const total = items.reduce(
    (sum, item) => sum + Number(item.unitPrice) * item.quantity,
    0,
  );

  return { items, total: Number(total.toFixed(2)) };
};

// ─────────────────────────────────────────
//  Helper — resolve unit price from request
//  Priority: size price > variant price > product/bean base price
// ─────────────────────────────────────────
const resolveUnitPrice = async (type, body) => {
  const { productId, variantId, sizeId, beanId, planId } = body;

  if (type === "coffee") {
    // Size price takes priority, then variant, then product base
    if (sizeId) {
      const size = await prisma.productSize.findUnique({
        where: { id: sizeId },
      });
      if (size) return Number(size.price);
    }
    if (variantId) {
      const variant = await prisma.productVariant.findUnique({
        where: { id: variantId },
      });
      if (variant) return Number(variant.price);
    }
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    return Number(product.price);
  }

  if (type === "bean") {
    const bean = await prisma.bean.findUnique({ where: { id: beanId } });
    let price = Number(bean.price);

    // Apply subscribe discount if plan selected
    if (planId) {
      const plan = await prisma.beanPurchasePlan.findUnique({
        where: { id: planId },
      });
      if (plan?.discount) {
        price = price - (price * Number(plan.discount)) / 100;
      }
    }
    return Number(price.toFixed(2));
  }

  return 0;
};

// ─────────────────────────────────────────
//  GET /api/cart
//  Fetch current user's cart with total
// ─────────────────────────────────────────
exports.getCart = asyncHandler(async (req, res) => {
  const cart = await getFullCart(req.user.id);
  res.status(200).json(cart);
});

// ─────────────────────────────────────────
//  POST /api/cart/items
//  Add item — if same options exist, increment qty
// ─────────────────────────────────────────
exports.addItem = asyncHandler(async (req, res) => {
  const {
    productId,
    type,
    quantity = 1,
    variantId = null,
    sizeId = null,
    beanId = null,
    grindId = null,
    planId = null,
  } = req.body;

  // Validate type
  if (!["coffee", "bean"].includes(type))
    return res.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "type must be coffee or bean",
      },
    });

  // Validate required fields per type
  if (type === "coffee" && !productId)
    return res.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "productId required for coffee type",
      },
    });

  if (type === "bean" && !beanId)
    return res.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "beanId required for bean type",
      },
    });

  // Resolve unit price
  const unitPrice = await resolveUnitPrice(type, req.body);

  // Check if same item with same options already in cart
  const existing = await prisma.cartItem.findFirst({
    where: {
      userId: req.user.id,
      type,
      productId: productId || null,
      variantId: variantId || null,
      sizeId: sizeId || null,
      beanId: beanId || null,
      grindId: grindId || null,
      planId: planId || null,
    },
  });

  if (existing) {
    // Same item exists → increment quantity
    await prisma.cartItem.update({
      where: { id: existing.id },
      data: { quantity: { increment: quantity } },
    });
  } else {
    // New item → create
    await prisma.cartItem.create({
      data: {
        userId: req.user.id,
        type,
        quantity,
        unitPrice,
        productId: productId || null,
        variantId: variantId || null,
        sizeId: sizeId || null,
        beanId: beanId || null,
        grindId: grindId || null,
        planId: planId || null,
      },
    });
  }

  // Return full updated cart
  const cart = await getFullCart(req.user.id);
  res.status(201).json(cart);
});

// ─────────────────────────────────────────
//  PATCH /api/cart/items/:id
//  Update quantity — if 0, delete the item
// ─────────────────────────────────────────
exports.updateItem = asyncHandler(async (req, res) => {
  const { quantity } = req.body;
  const { id } = req.params;

  if (quantity === undefined || quantity < 0)
    return res.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "quantity must be 0 or greater",
      },
    });

  // Verify item belongs to this user
  const item = await prisma.cartItem.findFirst({
    where: { id, userId: req.user.id },
  });

  if (!item)
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Cart item not found" },
    });

  if (quantity === 0) {
    // Delete item if quantity set to 0
    await prisma.cartItem.delete({ where: { id } });
  } else {
    await prisma.cartItem.update({
      where: { id },
      data: { quantity },
    });
  }

  const cart = await getFullCart(req.user.id);
  res.status(200).json(cart);
});

// ─────────────────────────────────────────
//  DELETE /api/cart/items/:id
//  Remove a specific item
// ─────────────────────────────────────────
exports.removeItem = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const item = await prisma.cartItem.findFirst({
    where: { id, userId: req.user.id },
  });

  if (!item)
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Cart item not found" },
    });

  await prisma.cartItem.delete({ where: { id } });

  const cart = await getFullCart(req.user.id);
  res.status(200).json(cart);
});

// ─────────────────────────────────────────
//  DELETE /api/cart
//  Clear entire cart
// ─────────────────────────────────────────
exports.clearCart = asyncHandler(async (req, res) => {
  await prisma.cartItem.deleteMany({ where: { userId: req.user.id } });
  res.status(200).json({ success: true });
});
