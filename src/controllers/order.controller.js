const prisma = require("../config/prisma");
const asyncHandler = require("../utils/asyncHandler");
const {
  sendOrderStatusNotification,
  sendAdminNotification,
} = require("../services/notificationService");
const { sendOrderConfirmationEmail } = require("../services/emailService");

// ─────────────────────────────────────────
//  Tracking config
//  pickup:   3 steps, ~10 min total
//  delivery: 3 steps, ~35 min total
// ─────────────────────────────────────────
const TRACKING_STEPS = {
  pickup: [
    { step: 1, label: "Order confirmed", seconds: 60 },
    { step: 2, label: "Being prepared", seconds: 420 },
    { step: 3, label: "Ready for pickup", seconds: 120 },
  ],
  delivery: [
    { step: 1, label: "Order confirmed", seconds: 60 },
    { step: 2, label: "Being prepared", seconds: 420 },
    { step: 3, label: "Out for delivery", seconds: 1620 },
  ],
};

const ESTIMATED_TIME = {
  pickup: "Ready in 10–15 minutes",
  delivery: "Estimated delivery 30–40 minutes",
};

// ─────────────────────────────────────────
//  Helper — full order include
// ─────────────────────────────────────────
const orderInclude = {
  orderItems: {
    include: {
      product: {
        select: { id: true, name: true, subtitle: true, imageUrl: true },
      },
      variant: { select: { id: true, name: true } },
      size: { select: { id: true, label: true } },
      bean: {
        select: {
          id: true,
          name: true,
          origin: true,
          imageUrl: true,
          weight: true,
        },
      },
      grind: { select: { id: true, grind: true } },
      plan: {
        select: { id: true, plan: true, discount: true, description: true },
      },
    },
  },
};

// ─────────────────────────────────────────
//  Helper — compute current tracking step
//  based on order confirmedAt + elapsed time
// ─────────────────────────────────────────
const computeTracking = (order) => {
  const steps = TRACKING_STEPS[order.deliveryMethod];
  const startTime = order.confirmedAt || order.createdAt;

  if (
    order.status !== "confirmed" &&
    order.status !== "preparing" &&
    order.status !== "ready" &&
    order.status !== "out_for_delivery" &&
    order.status !== "delivered"
  ) {
    return {
      currentStep: 0,
      secondsRemaining: 0,
      steps: steps.map((s) => ({ step: s.step, label: s.label })),
      isActive: false,
      message: "Waiting for order confirmation...",
    };
  }

  const elapsed = Math.floor(
    (Date.now() - new Date(startTime).getTime()) / 1000,
  );

  let cumulative = 0;
  let currentStep = steps.length;
  let secondsRemaining = 0;

  for (const s of steps) {
    cumulative += s.seconds;
    if (elapsed < cumulative) {
      currentStep = s.step;
      secondsRemaining = cumulative - elapsed;
      break;
    }
  }

  if (order.status === "delivered") {
    currentStep = steps.length;
    secondsRemaining = 0;
  }

  return {
    currentStep,
    secondsRemaining: Math.max(0, secondsRemaining),
    steps: steps.map((s) => ({ step: s.step, label: s.label })),
    isActive: true,
    estimatedRemaining: formatEstimatedTime(secondsRemaining),
  };
};

const formatEstimatedTime = (seconds) => {
  if (seconds <= 0) return "Ready now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes !== 1 ? "s" : ""}`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours !== 1 ? "s" : ""}`;
};

// ─────────────────────────────────────────
//  Helper — loyalty points
// ─────────────────────────────────────────
const addLoyaltyPointsForOrder = async (orderId, userId, total) => {
  const EARN_RATE = 1;
  const pointsEarned = Math.floor(Number(total) * EARN_RATE);
  if (pointsEarned > 0) {
    await prisma.loyaltyPoint.create({
      data: { userId, points: pointsEarned, source: "order", sourceId: orderId },
    });
    console.log(`Added ${pointsEarned} loyalty points to user ${userId} for order ${orderId}`);
  }
  return pointsEarned;
};

const addFirstOrderBonus = async (userId, orderId) => {
  const completedOrdersCount = await prisma.order.count({
    where: { userId, status: "delivered" },
  });

  if (completedOrdersCount === 1) {
    const firstOrderAction = await prisma.earnAction.findUnique({
      where: { actionKey: "first_order" },
    });

    if (firstOrderAction && firstOrderAction.isActive) {
      const alreadyEarned = await prisma.userEarnAction.findFirst({
        where: { userId, earnActionId: firstOrderAction.id },
      });

      if (!alreadyEarned) {
        await prisma.$transaction([
          prisma.loyaltyPoint.create({
            data: {
              userId,
              points: firstOrderAction.pointsEarned,
              source: "first_order",
              sourceId: orderId,
            },
          }),
          prisma.userEarnAction.create({
            data: { userId, earnActionId: firstOrderAction.id },
          }),
        ]);
        console.log(`Added first order bonus of ${firstOrderAction.pointsEarned} points to user ${userId}`);
      }
    }
  }
};

// ─────────────────────────────────────────
//  POST /api/orders
//  Place order from current cart
// ─────────────────────────────────────────
exports.createOrder = asyncHandler(async (req, res) => {
  const {
    deliveryMethod,
    contactName,
    contactPhone,
    contactEmail,
    addressLine,
    addressCity,
    addressProvince,
    addressPostal,
    channel,
    orderMode,
    tableNumber,
    pickupTime,
  } = req.body;

  if (!["pickup", "delivery"].includes(deliveryMethod))
    return res.status(422).json({
      error: { code: "VALIDATION_ERROR", message: "deliveryMethod must be pickup or delivery" },
    });

  const orderChannel = channel || "web";

  let orderModeValue = orderMode;
  if (!orderModeValue) {
    orderModeValue = deliveryMethod === "delivery" ? "delivery" : "takeaway";
  }

  if (orderModeValue === "dinein" && !tableNumber) {
    return res.status(422).json({
      error: { code: "VALIDATION_ERROR", message: "tableNumber is required for dine-in orders" },
    });
  }

  if (orderModeValue === "takeaway" && pickupTime) {
    const pickupDateTime = new Date(pickupTime);
    if (pickupDateTime < new Date()) {
      return res.status(422).json({
        error: { code: "VALIDATION_ERROR", message: "pickupTime must be in the future" },
      });
    }
  }

  if (deliveryMethod === "delivery" && !addressLine)
    return res.status(422).json({
      error: { code: "VALIDATION_ERROR", message: "addressLine is required for delivery" },
    });

  const cartItems = await prisma.cartItem.findMany({
    where: { userId: req.user.id },
    include: { plan: true },
  });

  if (cartItems.length === 0)
    return res.status(422).json({
      error: { code: "EMPTY_CART", message: "Your cart is empty" },
    });

  const hasSubscription = cartItems.some((i) => i.plan?.plan === "subscribe");
  if (hasSubscription && deliveryMethod === "pickup")
    return res.status(422).json({
      error: {
        code: "FULFILLMENT_ERROR",
        message: "Subscription items cannot be picked up. Please select delivery.",
      },
    });

  const total = cartItems.reduce(
    (sum, item) => sum + Number(item.unitPrice) * item.quantity,
    0,
  );

  const order = await prisma.order.create({
    data: {
      userId: req.user.id,
      deliveryMethod,
      total: Number(total.toFixed(2)),
      estimatedTime: ESTIMATED_TIME[deliveryMethod],
      contactName,
      contactPhone,
      contactEmail,
      addressLine: addressLine || null,
      addressCity: addressCity || null,
      addressProvince: addressProvince || null,
      addressPostal: addressPostal || null,
      channel: orderChannel,
      orderMode: orderModeValue,
      tableNumber: orderModeValue === "dinein" ? tableNumber : null,
      pickupTime: orderModeValue === "takeaway" && pickupTime ? new Date(pickupTime) : null,
      orderItems: {
        create: cartItems.map((item) => ({
          type: item.type,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          productId: item.productId || null,
          variantId: item.variantId || null,
          sizeId: item.sizeId || null,
          beanId: item.beanId || null,
          grindId: item.grindId || null,
          planId: item.planId || null,
        })),
      },
    },
    include: orderInclude,
  });

  // Notify admin about new order
  await sendAdminNotification(
    "New Order Received!",
    `Order #${order.id.slice(-8).toUpperCase()} from ${order.contactName} - $${Number(order.total).toFixed(2)}`,
    "admin_alert",
    { orderId: order.id, type: "new_order" },
  );

  // Send order confirmation email to customer (NEW)
  const orderUser = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { name: true, email: true },
  });
  if (orderUser?.email) {
    await sendOrderConfirmationEmail({
      to: orderUser.email,
      name: orderUser.name,
      orderNumber: order.id.slice(-8).toUpperCase(),
      total: Number(order.total),
    });
  }

  // Clear cart
  await prisma.cartItem.deleteMany({ where: { userId: req.user.id } });

  res.status(201).json({ data: order });
});

// ─────────────────────────────────────────
//  GET /api/orders — Order history paginated
// ─────────────────────────────────────────
exports.getUserOrders = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({
      where: { userId: req.user.id },
      select: {
        id: true,
        status: true,
        deliveryMethod: true,
        total: true,
        estimatedTime: true,
        createdAt: true,
        _count: { select: { orderItems: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: Number(limit),
    }),
    prisma.order.count({ where: { userId: req.user.id } }),
  ]);

  res.status(200).json({
    data: orders.map((o) => ({
      ...o,
      itemCount: o._count.orderItems,
      _count: undefined,
    })),
    page: Number(page),
    limit: Number(limit),
    total,
  });
});

// ─────────────────────────────────────────
//  GET /api/orders/:id — Single order detail
// ─────────────────────────────────────────
exports.getOrder = asyncHandler(async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    include: orderInclude,
  });

  if (!order)
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Order not found" },
    });

  const subtotal = order.orderItems.reduce(
    (sum, item) => sum + Number(item.unitPrice) * item.quantity,
    0,
  );

  res.status(200).json({
    data: {
      id: order.id,
      status: order.status,
      deliveryMethod: order.deliveryMethod,
      estimatedTime: order.estimatedTime,
      createdAt: order.createdAt,
      items: order.orderItems,
      contactDetails: {
        name: order.contactName,
        phone: order.contactPhone,
        email: order.contactEmail,
      },
      deliveryInfo:
        order.deliveryMethod === "delivery"
          ? {
              line: order.addressLine,
              city: order.addressCity,
              province: order.addressProvince,
              postal: order.addressPostal,
            }
          : null,
      paymentSummary: {
        subtotal: Number(subtotal.toFixed(2)),
        total: Number(order.total),
      },
    },
  });
});

// ─────────────────────────────────────────
//  GET /api/orders/:id/track — Polling fallback
// ─────────────────────────────────────────
exports.trackOrder = asyncHandler(async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    select: {
      id: true,
      status: true,
      deliveryMethod: true,
      createdAt: true,
      confirmedAt: true,
    },
  });

  if (!order)
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Order not found" },
    });

  const tracking = computeTracking(order);
  res.status(200).json({ data: tracking });
});

// ─────────────────────────────────────────
//  PATCH /api/orders/:id/status  (admin)
// ─────────────────────────────────────────
exports.updateStatus = asyncHandler(async (req, res) => {
  const valid = ["pending", "confirmed", "preparing", "ready", "out_for_delivery", "delivered", "cancelled"];

  if (!valid.includes(req.body.status))
    return res.status(422).json({
      error: { code: "VALIDATION_ERROR", message: `status must be one of: ${valid.join(", ")}` },
    });

  const updateData = { status: req.body.status };

  if (req.body.status === "confirmed") {
    const currentOrder = await prisma.order.findUnique({
      where: { id: req.params.id },
      select: { confirmedAt: true },
    });
    if (!currentOrder.confirmedAt) {
      updateData.confirmedAt = new Date();
    }
  }

  const order = await prisma.order.update({
    where: { id: req.params.id },
    data: updateData,
    include: orderInclude,
  });

  if (req.body.status !== "pending") {
    const user = await prisma.user.findUnique({
      where: { id: order.userId },
      select: { id: true, name: true, email: true },
    });
    await sendOrderStatusNotification(order, req.body.status, user);
  }

  if (req.body.status === "delivered") {
    await addLoyaltyPointsForOrder(order.id, order.userId, order.total);
    await addFirstOrderBonus(order.userId, order.id);
  }

  res.status(200).json({
    data: order,
    loyalty_points_earned: req.body.status === "delivered" ? Math.floor(Number(order.total)) : 0,
  });
});

// ─────────────────────────────────────────
//  WebSocket handler
// ─────────────────────────────────────────
exports.trackOrderWs = async (ws, req) => {
  const { id } = req.params;
  const userId = req.user?.id;

  const order = await prisma.order.findFirst({
    where: { id, userId },
    select: { id: true, status: true, deliveryMethod: true, createdAt: true, confirmedAt: true },
  });

  if (!order) {
    ws.send(JSON.stringify({ error: "Order not found" }));
    ws.close();
    return;
  }

  const send = () => {
    if (ws.readyState === ws.OPEN) {
      const tracking = computeTracking(order);
      ws.send(JSON.stringify(tracking));
    }
  };

  send();
  const interval = setInterval(send, 10000);
  ws.on("close", () => clearInterval(interval));
  ws.on("error", () => clearInterval(interval));
};

// ─────────────────────────────────────────
//  GET /api/orders/admin/all
// ─────────────────────────────────────────
exports.getAllOrders = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20, search } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  let where = {};
  if (status) {
    if (status.includes(",")) {
      where.status = { in: status.split(",") };
    } else {
      where.status = status;
    }
  }
  if (search) {
    where.OR = [
      { contactName: { contains: search, mode: "insensitive" } },
      { contactEmail: { contains: search, mode: "insensitive" } },
      { contactPhone: { contains: search, mode: "insensitive" } },
      { id: { contains: search, mode: "insensitive" } },
    ];
  }

  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      include: {
        orderItems: {
          include: {
            product: { select: { id: true, name: true, subtitle: true, imageUrl: true } },
            variant: { select: { id: true, name: true } },
            size: { select: { id: true, label: true } },
            bean: { select: { id: true, name: true, origin: true, imageUrl: true, weight: true } },
            grind: { select: { id: true, grind: true } },
          },
        },
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: Number(limit),
    }),
    prisma.order.count({ where }),
  ]);

  res.status(200).json({ success: true, data: orders, total, page: Number(page), limit: Number(limit) });
});

// ─────────────────────────────────────────
//  GET /api/orders/admin/:id
// ─────────────────────────────────────────
exports.getOrderAdmin = asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: {
      orderItems: {
        include: {
          product: { select: { id: true, name: true, subtitle: true, imageUrl: true } },
          variant: { select: { id: true, name: true } },
          size: { select: { id: true, label: true } },
          bean: { select: { id: true, name: true, origin: true, imageUrl: true, weight: true } },
          grind: { select: { id: true, grind: true } },
          plan: { select: { id: true, plan: true, discount: true, description: true } },
        },
      },
      user: { select: { id: true, name: true, email: true, phone: true } },
    },
  });

  if (!order) {
    return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Order not found" } });
  }

  const subtotal = order.orderItems.reduce(
    (sum, item) => sum + Number(item.unitPrice) * item.quantity, 0,
  );

  res.status(200).json({
    success: true,
    data: {
      id: order.id,
      status: order.status,
      deliveryMethod: order.deliveryMethod,
      estimatedTime: order.estimatedTime,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: order.orderItems,
      user: order.user,
      contactDetails: { name: order.contactName, phone: order.contactPhone, email: order.contactEmail },
      deliveryInfo: order.deliveryMethod === "delivery"
        ? { line: order.addressLine, city: order.addressCity, province: order.addressProvince, postal: order.addressPostal }
        : null,
      paymentSummary: { subtotal: Number(subtotal.toFixed(2)), total: Number(order.total) },
    },
  });
});

// ─────────────────────────────────────────
//  GET /api/orders/admin/stats
// ─────────────────────────────────────────
exports.getOrderStats = asyncHandler(async (req, res) => {
  const [totalOrders, statusCounts, revenue] = await prisma.$transaction([
    prisma.order.count(),
    prisma.order.groupBy({ by: ["status"], _count: { status: true }, _sum: { total: true } }),
    prisma.order.aggregate({ _sum: { total: true } }),
  ]);

  const statusStats = {};
  statusCounts.forEach((stat) => {
    statusStats[stat.status] = { count: stat._count.status, revenue: Number(stat._sum.total || 0) };
  });

  res.status(200).json({
    success: true,
    data: { totalOrders, totalRevenue: Number(revenue._sum.total || 0), byStatus: statusStats },
  });
});

// ─────────────────────────────────────────
//  POST /api/orders/:id/cancel
// ─────────────────────────────────────────
exports.cancelOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const order = await prisma.order.findFirst({ where: { id, userId: req.user.id } });

  if (!order) {
    return res.status(404).json({ error: { code: "NOT_FOUND", message: "Order not found" } });
  }

  if (order.status !== "pending") {
    return res.status(422).json({
      error: { code: "CANCELLATION_NOT_ALLOWED", message: `Order cannot be cancelled when status is ${order.status}` },
    });
  }

  const cancelledOrder = await prisma.order.update({
    where: { id },
    data: { status: "cancelled" },
    include: orderInclude,
  });

  res.status(200).json({ success: true, message: "Order cancelled successfully", data: cancelledOrder });
});

// ─────────────────────────────────────────
//  GET /api/orders/admin/metrics/overview
// ─────────────────────────────────────────
exports.getOverviewMetrics = asyncHandler(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const [todayOrders, todayRevenue, activeOrders, totalProducts, totalBeans, activeSubscriptions] =
    await Promise.all([
      prisma.order.count({ where: { createdAt: { gte: today } } }),
      prisma.order.aggregate({ where: { createdAt: { gte: today } }, _sum: { total: true } }),
      prisma.order.count({ where: { status: { in: ["pending", "confirmed", "preparing", "ready", "out_for_delivery"] } } }),
      prisma.product.count({ where: { isAvailable: true } }),
      prisma.bean.count({ where: { isAvailable: true } }),
      prisma.subscription.count({ where: { status: "active" } }),
    ]);

  const yesterdayRevenue = await prisma.order.aggregate({
    where: { createdAt: { gte: yesterday, lt: today } },
    _sum: { total: true },
  });

  const completedOrders = await prisma.order.findMany({
    where: { status: "delivered", confirmedAt: { not: null } },
    select: { confirmedAt: true, createdAt: true },
  });

  let avgPrepTime = 0;
  if (completedOrders.length > 0) {
    const totalPrepTime = completedOrders.reduce((sum, order) => {
      return sum + (order.confirmedAt.getTime() - order.createdAt.getTime()) / 1000 / 60;
    }, 0);
    avgPrepTime = Math.round(totalPrepTime / completedOrders.length);
  }

  const todayRevenueAmount = todayRevenue._sum.total || 0;
  const yesterdayRevenueAmount = yesterdayRevenue._sum.total || 0;
  const revenueChange = yesterdayRevenueAmount > 0
    ? ((todayRevenueAmount - yesterdayRevenueAmount) / yesterdayRevenueAmount) * 100
    : 0;

  res.status(200).json({
    success: true,
    data: {
      todayOrders,
      todayRevenue: todayRevenueAmount,
      revenueChange: parseFloat(revenueChange.toFixed(1)),
      activeOrders,
      totalProducts,
      totalBeans,
      activeSubscriptions,
      averagePrepTime: avgPrepTime,
    },
  });
});

// ─────────────────────────────────────────
//  GET /api/orders/admin/metrics/sales-hourly
// ─────────────────────────────────────────
exports.getSalesHourly = asyncHandler(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const todayOrders = await prisma.order.findMany({
    where: { createdAt: { gte: today } },
    select: { createdAt: true, total: true },
  });

  const weekOrders = await prisma.order.findMany({
    where: { createdAt: { gte: sevenDaysAgo, lt: today } },
    select: { createdAt: true, total: true },
  });

  const hours = [];
  const todayData = [];
  const avgData = [];
  for (let i = 6; i <= 22; i++) { hours.push(`${i}:00`); todayData.push(0); avgData.push(0); }

  todayOrders.forEach((order) => {
    const index = order.createdAt.getHours() - 6;
    if (index >= 0 && index <= 16) todayData[index] += Number(order.total);
  });

  const hourTotals = new Array(17).fill(0);
  const hourCounts = new Array(17).fill(0);
  weekOrders.forEach((order) => {
    const index = order.createdAt.getHours() - 6;
    if (index >= 0 && index <= 16) { hourTotals[index] += Number(order.total); hourCounts[index]++; }
  });
  for (let i = 0; i < 17; i++) {
    avgData[i] = hourCounts[i] > 0 ? hourTotals[i] / hourCounts[i] : 0;
  }

  res.status(200).json({
    success: true,
    data: {
      hours,
      today: todayData.map((v) => Number(v.toFixed(2))),
      average: avgData.map((v) => Number(v.toFixed(2))),
    },
  });
});

// ─────────────────────────────────────────
//  GET /api/orders/admin/metrics/channel-split
// ─────────────────────────────────────────
exports.getChannelSplit = asyncHandler(async (req, res) => {
  const byChannel = await prisma.order.groupBy({
    by: ["channel"],
    where: { status: { not: "cancelled" } },
    _count: true,
    _sum: { total: true },
  });

  const byMode = await prisma.order.groupBy({
    by: ["orderMode"],
    where: { status: { not: "cancelled" } },
    _count: true,
    _sum: { total: true },
  });

  res.status(200).json({
    success: true,
    data: {
      byChannel: byChannel.map((c) => ({ name: c.channel || "unknown", count: c._count, revenue: Number(c._sum.total || 0) })),
      byMode: byMode.map((m) => ({ name: m.orderMode || "unknown", count: m._count, revenue: Number(m._sum.total || 0) })),
    },
  });
});

// ─────────────────────────────────────────
//  GET /api/orders/admin/orders/live
// ─────────────────────────────────────────
exports.getLiveOrders = asyncHandler(async (req, res) => {
  const orders = await prisma.order.findMany({
    take: 10,
    orderBy: { createdAt: "desc" },
    select: {
      id: true, status: true, deliveryMethod: true, total: true,
      createdAt: true, contactName: true,
      user: { select: { name: true } },
    },
  });

  res.status(200).json({
    success: true,
    data: orders.map((order) => ({
      id: order.id.slice(-8).toUpperCase(),
      customer: order.contactName || order.user?.name || "Guest",
      status: order.status,
      method: order.deliveryMethod,
      total: Number(order.total),
      time: order.createdAt,
    })),
  });
});
