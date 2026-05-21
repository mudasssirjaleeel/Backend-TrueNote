const prisma = require("../config/prisma");
const asyncHandler = require("../utils/asyncHandler");

// Helper to calculate next delivery date
const getNextDeliveryDate = (plan, currentDate = null) => {
  const date = currentDate ? new Date(currentDate) : new Date();

  switch (plan) {
    case "weekly":
      date.setDate(date.getDate() + 7);
      break;
    case "biweekly":
      date.setDate(date.getDate() + 14);
      break;
    case "monthly":
      date.setMonth(date.getMonth() + 1);
      break;
    default:
      date.setDate(date.getDate() + 7);
  }

  return date;
};

// ─────────────────────────────────────────
//  GET /api/subscriptions
//  List all active subscriptions for the user
// ─────────────────────────────────────────
exports.getSubscriptions = asyncHandler(async (req, res) => {
  const subscriptions = await prisma.subscription.findMany({
    where: {
      userId: req.user.id,
      status: { not: "cancelled" },
    },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          imageUrl: true,
        },
      },
      bean: {
        select: {
          id: true,
          name: true,
          origin: true,
          weight: true,
          imageUrl: true,
        },
      },
      grindOption: {
        select: {
          grind: true,
        },
      },
    },
    orderBy: { nextDeliveryDate: "asc" },
  });

  const formattedSubscriptions = subscriptions.map((sub) => {
    const isProduct = sub.product !== null;
    const item = isProduct ? sub.product : sub.bean;

    let grind = null;
    if (!isProduct && sub.grindOption) {
      grind = sub.grindOption.grind;
    }

    return {
      id: sub.id,
      product_name: item?.name || "Unknown Product",
      origin: !isProduct ? sub.bean?.origin : null,
      weight: !isProduct ? sub.bean?.weight : null,
      grind: grind,
      image_url: item?.imageUrl || null,
      delivery_plan: sub.deliveryPlan,
      next_delivery: sub.nextDeliveryDate.toISOString(),
      price: parseFloat(sub.price),
      is_paused: sub.status === "paused",
      type: isProduct ? "coffee" : "bean",
    };
  });

  res.status(200).json({ subscriptions: formattedSubscriptions });
});

// ─────────────────────────────────────────
//  POST /api/subscriptions
//  Create a new subscription (for testing/admin)
// ─────────────────────────────────────────
exports.createSubscription = asyncHandler(async (req, res) => {
  const { productId, beanId, grindOptionId, deliveryPlan, price } = req.body;

  // Validate
  if (!deliveryPlan || !price) {
    return res.status(400).json({
      error: {
        code: "MISSING_FIELDS",
        message: "deliveryPlan and price are required",
      },
    });
  }

  if (!productId && !beanId) {
    return res.status(400).json({
      error: {
        code: "MISSING_PRODUCT_OR_BEAN",
        message: "Either productId or beanId is required",
      },
    });
  }

  // Validate delivery plan
  if (!["weekly", "biweekly", "monthly"].includes(deliveryPlan)) {
    return res.status(400).json({
      error: {
        code: "INVALID_PLAN",
        message: "deliveryPlan must be weekly, biweekly, or monthly",
      },
    });
  }

  // If bean subscription, grindOptionId is required
  if (beanId && !grindOptionId) {
    return res.status(400).json({
      error: {
        code: "MISSING_GRIND_OPTION",
        message: "grindOptionId is required for bean subscription",
      },
    });
  }

  const nextDeliveryDate = getNextDeliveryDate(deliveryPlan);

  const subscription = await prisma.subscription.create({
    data: {
      userId: req.user.id,
      productId: productId || null,
      beanId: beanId || null,
      grindOptionId: grindOptionId || null,
      deliveryPlan,
      nextDeliveryDate,
      price,
      status: "active",
    },
    include: {
      product: true,
      bean: true,
      grindOption: true,
    },
  });

  const isProduct = subscription.product !== null;
  const item = isProduct ? subscription.product : subscription.bean;

  res.status(201).json({
    subscription: {
      id: subscription.id,
      product_name: item?.name,
      delivery_plan: subscription.deliveryPlan,
      next_delivery: subscription.nextDeliveryDate.toISOString(),
      price: parseFloat(subscription.price),
      is_paused: false,
    },
  });
});

// PATCH /api/subscriptions/:id/pause (toggle)
exports.togglePauseSubscription = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const isAdmin = req.user.role === 'admin';

  const whereCondition = isAdmin 
    ? { id }
    : { id, userId: req.user.id };

  const subscription = await prisma.subscription.findFirst({
    where: { ...whereCondition, status: { not: "cancelled" } },
  });

  if (!subscription) {
    return res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Subscription not found",
      },
    });
  }

  const newStatus = subscription.status === "active" ? "paused" : "active";

  const updatedSubscription = await prisma.subscription.update({
    where: { id },
    data: { status: newStatus },
  });

  const message = newStatus === "paused"
    ? "Subscription paused successfully"
    : "Subscription resumed successfully";

  res.status(200).json({
    id: updatedSubscription.id,
    is_paused: updatedSubscription.status === "paused",
    message: message,
  });
});
// PATCH /api/subscriptions/:id/skip
exports.skipNextDelivery = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const isAdmin = req.user.role === 'admin';

  const whereCondition = isAdmin 
    ? { id }
    : { id, userId: req.user.id };

  const subscription = await prisma.subscription.findFirst({
    where: { ...whereCondition, status: "active" },
  });

  if (!subscription) {
    return res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Active subscription not found",
      },
    });
  }

  const nextDeliveryDate = getNextDeliveryDate(
    subscription.deliveryPlan,
    subscription.nextDeliveryDate,
  );

  const updatedSubscription = await prisma.subscription.update({
    where: { id },
    data: { nextDeliveryDate },
  });

  res.status(200).json({
    id: updatedSubscription.id,
    next_delivery: updatedSubscription.nextDeliveryDate.toISOString(),
    message: `Next delivery skipped. New delivery date: ${updatedSubscription.nextDeliveryDate.toLocaleDateString()}`,
  });
});

// DELETE /api/subscriptions/:id
exports.cancelSubscription = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const isAdmin = req.user.role === 'admin';

  const whereCondition = isAdmin 
    ? { id }
    : { id, userId: req.user.id };

  const subscription = await prisma.subscription.findFirst({
    where: { ...whereCondition, status: { not: "cancelled" } },
  });

  if (!subscription) {
    return res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Subscription not found",
      },
    });
  }

  await prisma.subscription.update({
    where: { id },
    data: {
      status: "cancelled",
      cancelledAt: new Date(),
    },
  });

  res.status(200).json({ success: true });
});




// ─────────────────────────────────────────
//  GET /api/subscriptions/:id
//  Get single subscription details
// ─────────────────────────────────────────
exports.getSubscriptionById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const subscription = await prisma.subscription.findFirst({
    where: {
      id,
      userId: req.user.id,
    },
    include: {
      product: {
        select: { id: true, name: true, imageUrl: true, price: true },
      },
      bean: {
        select: { id: true, name: true, origin: true, weight: true, imageUrl: true, price: true },
      },
      grindOption: {
        select: { grind: true },
      },
    },
  });

  if (!subscription) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Subscription not found" },
    });
  }

  const isProduct = subscription.product !== null;
  const item = isProduct ? subscription.product : subscription.bean;

  res.status(200).json({
    subscription: {
      id: subscription.id,
      type: isProduct ? "coffee" : "bean",
      name: item?.name,
      origin: !isProduct ? subscription.bean?.origin : null,
      weight: !isProduct ? subscription.bean?.weight : null,
      grind: !isProduct ? subscription.grindOption?.grind : null,
      imageUrl: item?.imageUrl,
      price: parseFloat(subscription.price),
      deliveryPlan: subscription.deliveryPlan,
      nextDeliveryDate: subscription.nextDeliveryDate,
      status: subscription.status,
      createdAt: subscription.createdAt,
      cancelledAt: subscription.cancelledAt,
    },
  });
});

// POST /api/subscriptions/:id/resume
exports.resumeSubscription = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const isAdmin = req.user.role === 'admin';

  const whereCondition = isAdmin 
    ? { id }  // Admin can access any subscription
    : { id, userId: req.user.id }; // User can only access their own

  const subscription = await prisma.subscription.findFirst({
    where: { ...whereCondition, status: "paused" },
  });

  if (!subscription) {
    return res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Paused subscription not found",
      },
    });
  }

  const updatedSubscription = await prisma.subscription.update({
    where: { id },
    data: { status: "active" },
  });

  res.status(200).json({
    success: true,
    message: "Subscription resumed successfully",
    subscription: {
      id: updatedSubscription.id,
      status: updatedSubscription.status,
      nextDeliveryDate: updatedSubscription.nextDeliveryDate,
    },
  });
});

// ─────────────────────────────────────────
//  GET /api/subscriptions/admin/all (Admin only)
//  Get all subscriptions with filters
// ─────────────────────────────────────────
exports.adminGetAllSubscriptions = asyncHandler(async (req, res) => {
  const { status, plan, page = 1, limit = 20, search } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  // Build where clause
  let where = {};

  if (status) {
    where.status = status;
  }

  if (plan) {
    where.deliveryPlan = plan;
  }

  if (search) {
    where.OR = [
      { user: { name: { contains: search, mode: "insensitive" } } },
      { user: { email: { contains: search, mode: "insensitive" } } },
      { product: { name: { contains: search, mode: "insensitive" } } },
      { bean: { name: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [subscriptions, total] = await prisma.$transaction([
    prisma.subscription.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        product: {
          select: { id: true, name: true, imageUrl: true },
        },
        bean: {
          select: { id: true, name: true, origin: true, weight: true, imageUrl: true },
        },
        grindOption: {
          select: { grind: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: Number(limit),
    }),
    prisma.subscription.count({ where }),
  ]);

  res.status(200).json({
    success: true,
    data: subscriptions,
    total,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil(total / Number(limit)),
  });
});

// ─────────────────────────────────────────
//  GET /api/subscriptions/admin/upcoming (Admin only)
//  Get upcoming renewals in next N days
// ─────────────────────────────────────────
exports.adminGetUpcomingRenewals = asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;
  const today = new Date();
  const futureDate = new Date();
  futureDate.setDate(today.getDate() + Number(days));

  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: "active",
      nextDeliveryDate: {
        gte: today,
        lte: futureDate,
      },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      },
      product: {
        select: { id: true, name: true },
      },
      bean: {
        select: { id: true, name: true },
      },
    },
    orderBy: { nextDeliveryDate: "asc" },
  });

  res.status(200).json({
    success: true,
    data: subscriptions,
    count: subscriptions.length,
    days: Number(days),
  });
});

// ─────────────────────────────────────────
//  GET /api/subscriptions/admin/stats (Admin only)
//  Get subscription statistics
// ─────────────────────────────────────────
exports.adminGetSubscriptionStats = asyncHandler(async (req, res) => {
  const [total, active, paused, cancelled, byPlan] = await prisma.$transaction([
    prisma.subscription.count(),
    prisma.subscription.count({ where: { status: "active" } }),
    prisma.subscription.count({ where: { status: "paused" } }),
    prisma.subscription.count({ where: { status: "cancelled" } }),
    prisma.subscription.groupBy({
      by: ["deliveryPlan"],
      where: { status: "active" },
      _count: true,
      _sum: { price: true },
    }),
  ]);

  const monthlyRecurringRevenue = byPlan.reduce((sum, plan) => {
    let multiplier = 1;
    if (plan.deliveryPlan === "weekly") multiplier = 4;
    if (plan.deliveryPlan === "biweekly") multiplier = 2;
    return sum + (plan._sum.price || 0) * multiplier;
  }, 0);

  res.status(200).json({
    success: true,
    stats: {
      total,
      active,
      paused,
      cancelled,
      monthlyRecurringRevenue: parseFloat(monthlyRecurringRevenue.toFixed(2)),
      byPlan: byPlan.map((plan) => ({
        plan: plan.deliveryPlan,
        count: plan._count,
        revenue: parseFloat((plan._sum.price || 0).toFixed(2)),
      })),
    },
  });
});

// POST /api/subscriptions/:id/pause 
exports.pauseSubscription = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const isAdmin = req.user.role === 'admin';

  const whereCondition = isAdmin 
    ? { id }  // Admin can access any subscription
    : { id, userId: req.user.id }; // User can only access their own

  const subscription = await prisma.subscription.findFirst({
    where: { ...whereCondition, status: "active" },
  });

  if (!subscription) {
    return res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Active subscription not found",
      },
    });
  }

  const updatedSubscription = await prisma.subscription.update({
    where: { id },
    data: { status: "paused" },
  });

  res.status(200).json({
    success: true,
    message: "Subscription paused successfully",
    subscription: {
      id: updatedSubscription.id,
      status: updatedSubscription.status,
    },
  });
});