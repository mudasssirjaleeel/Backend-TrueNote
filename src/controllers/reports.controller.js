const prisma = require("../config/prisma");
const asyncHandler = require("../utils/asyncHandler");

// ─────────────────────────────────────────
//  GET /api/reports/sales-summary
//  Get sales summary with date range filtering
// ─────────────────────────────────────────
exports.getSalesSummary = asyncHandler(async (req, res) => {
  const { period = "month", startDate, endDate } = req.query;

  let start, end;
  const now = new Date();

  if (startDate && endDate) {
    start = new Date(startDate);
    end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
  } else {
    switch (period) {
      case "today":
        start = new Date();
        start.setHours(0, 0, 0, 0);
        end = new Date();
        end.setHours(23, 59, 59, 999);
        break;
      case "week":
        start = new Date();
        start.setDate(now.getDate() - 7);
        start.setHours(0, 0, 0, 0);
        end = now;
        break;
      case "month":
        start = new Date();
        start.setMonth(now.getMonth() - 1);
        start.setHours(0, 0, 0, 0);
        end = now;
        break;
      case "year":
        start = new Date();
        start.setFullYear(now.getFullYear() - 1);
        start.setHours(0, 0, 0, 0);
        end = now;
        break;
      default:
        start = new Date();
        start.setMonth(now.getMonth() - 1);
        end = now;
    }
  }

  // Get orders in date range
  const orders = await prisma.order.findMany({
    where: {
      createdAt: { gte: start, lte: end },
      status: { not: "cancelled" },
    },
    include: {
      orderItems: {
        include: {
          product: true,
          bean: true,
        },
      },
    },
  });

  // Calculate totals
  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total), 0);
  const totalOrders = orders.length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Sales by day
  const salesByDay = {};
  orders.forEach((order) => {
    const day = order.createdAt.toISOString().split("T")[0];
    if (!salesByDay[day]) {
      salesByDay[day] = { revenue: 0, orders: 0 };
    }
    salesByDay[day].revenue += Number(order.total);
    salesByDay[day].orders += 1;
  });

  const dailyData = Object.entries(salesByDay)
    .map(([date, data]) => ({
      date,
      revenue: data.revenue,
      orders: data.orders,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Sales by delivery method
  const byMethod = await prisma.order.groupBy({
    by: ["deliveryMethod"],
    where: {
      createdAt: { gte: start, lte: end },
      status: { not: "cancelled" },
    },
    _count: true,
    _sum: { total: true },
  });

  const methodData = byMethod.map((m) => ({
    method: m.deliveryMethod,
    orders: m._count,
    revenue: Number(m._sum.total || 0),
  }));

  // Previous period comparison
  const periodDuration = end.getTime() - start.getTime();
  const prevStart = new Date(start.getTime() - periodDuration);
  const prevEnd = new Date(end.getTime() - periodDuration);

  const prevOrders = await prisma.order.aggregate({
    where: {
      createdAt: { gte: prevStart, lte: prevEnd },
      status: { not: "cancelled" },
    },
    _sum: { total: true },
    _count: true,
  });

  const prevRevenue = prevOrders._sum.total || 0;
  const revenueGrowth =
    prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;

  res.status(200).json({
    success: true,
    data: {
      summary: {
        totalRevenue,
        totalOrders,
        avgOrderValue,
        revenueGrowth: parseFloat(revenueGrowth.toFixed(1)),
        startDate: start,
        endDate: end,
      },
      dailySales: dailyData,
      byMethod: methodData,
    },
  });
});

// ─────────────────────────────────────────
//  GET /api/reports/best-sellers
//  Get top selling products and beans
// ─────────────────────────────────────────
exports.getBestSellers = asyncHandler(async (req, res) => {
  const { limit = 10, period = "month" } = req.query;

  let start;
  const now = new Date();

  switch (period) {
    case "week":
      start = new Date();
      start.setDate(now.getDate() - 7);
      break;
    case "month":
      start = new Date();
      start.setMonth(now.getMonth() - 1);
      break;
    case "year":
      start = new Date();
      start.setFullYear(now.getFullYear() - 1);
      break;
    default:
      start = new Date();
      start.setMonth(now.getMonth() - 1);
  }
  start.setHours(0, 0, 0, 0);

  // Get order items with products/beans
  const orderItems = await prisma.orderItem.findMany({
    where: {
      order: {
        createdAt: { gte: start },
        status: { not: "cancelled" },
      },
    },
    include: {
      product: true,
      bean: true,
      order: true,
    },
  });

  // Aggregate by product/bean
  const productSales = {};
  const beanSales = {};

  orderItems.forEach((item) => {
    if (item.product) {
      const id = item.product.id;
      if (!productSales[id]) {
        productSales[id] = {
          id: item.product.id,
          name: item.product.name,
          type: "coffee",
          quantity: 0,
          revenue: 0,
          imageUrl: item.product.imageUrl,
        };
      }
      productSales[id].quantity += item.quantity;
      productSales[id].revenue += Number(item.unitPrice) * item.quantity;
    } else if (item.bean) {
      const id = item.bean.id;
      if (!beanSales[id]) {
        beanSales[id] = {
          id: item.bean.id,
          name: item.bean.name,
          type: "bean",
          quantity: 0,
          revenue: 0,
          imageUrl: item.bean.imageUrl,
        };
      }
      beanSales[id].quantity += item.quantity;
      beanSales[id].revenue += Number(item.unitPrice) * item.quantity;
    }
  });

  // Combine and sort
  const allItems = [
    ...Object.values(productSales),
    ...Object.values(beanSales),
  ];
  const byQuantity = [...allItems]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, Number(limit));
  const byRevenue = [...allItems]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, Number(limit));

  res.status(200).json({
    success: true,
    data: {
      topByQuantity: byQuantity,
      topByRevenue: byRevenue,
      period,
      limit: Number(limit),
    },
  });
});

// ─────────────────────────────────────────
//  GET /api/reports/hourly-heatmap
//  Get order heatmap by hour and day of week
// ─────────────────────────────────────────
exports.getHourlyHeatmap = asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;

  const start = new Date();
  start.setDate(start.getDate() - Number(days));
  start.setHours(0, 0, 0, 0);

  // Get orders
  const orders = await prisma.order.findMany({
    where: {
      createdAt: { gte: start },
      status: { not: "cancelled" },
    },
    select: { createdAt: true, total: true },
  });

  // Create heatmap data (hour x day of week)
  const heatmapData = [];
  const daysOfWeek = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  for (let hour = 0; hour < 24; hour++) {
    for (let day = 0; day < 7; day++) {
      heatmapData.push({
        hour: `${hour}:00`,
        day: daysOfWeek[day],
        orders: 0,
        revenue: 0,
      });
    }
  }

  orders.forEach((order) => {
    const hour = order.createdAt.getHours();
    const day = order.createdAt.getDay();
    const index = heatmapData.findIndex(
      (d) => d.hour === `${hour}:00` && d.day === daysOfWeek[day],
    );
    if (index !== -1) {
      heatmapData[index].orders += 1;
      heatmapData[index].revenue += Number(order.total);
    }
  });

  res.status(200).json({
    success: true,
    data: {
      heatmap: heatmapData,
      days: daysOfWeek,
      hours: Array.from({ length: 24 }, (_, i) => `${i}:00`),
    },
  });
});

// ─────────────────────────────────────────
//  GET /api/reports/delivery-performance
//  Get delivery performance metrics
// ─────────────────────────────────────────
exports.getDeliveryPerformance = asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;

  const start = new Date();
  start.setDate(start.getDate() - Number(days));
  start.setHours(0, 0, 0, 0);

  // Get delivery orders
  const deliveryOrders = await prisma.order.findMany({
    where: {
      deliveryMethod: "delivery",
      createdAt: { gte: start },
      status: { not: "cancelled" },
    },
    select: {
      createdAt: true,
      confirmedAt: true,
      status: true,
      total: true,
    },
  });

  let totalDeliveryTime = 0;
  let completedDeliveries = 0;

  deliveryOrders.forEach((order) => {
    if (order.confirmedAt && order.status === "delivered") {
      const deliveryTime =
        (order.confirmedAt.getTime() - order.createdAt.getTime()) / 1000 / 60;
      totalDeliveryTime += deliveryTime;
      completedDeliveries++;
    }
  });

  const avgDeliveryTime =
    completedDeliveries > 0 ? totalDeliveryTime / completedDeliveries : 0;

  // Orders by status
  const byStatus = {
    pending: deliveryOrders.filter((o) => o.status === "pending").length,
    confirmed: deliveryOrders.filter((o) => o.status === "confirmed").length,
    preparing: deliveryOrders.filter((o) => o.status === "preparing").length,
    out_for_delivery: deliveryOrders.filter(
      (o) => o.status === "out_for_delivery",
    ).length,
    delivered: completedDeliveries,
    cancelled: deliveryOrders.filter((o) => o.status === "cancelled").length,
  };

  res.status(200).json({
    success: true,
    data: {
      totalDeliveryOrders: deliveryOrders.length,
      completedDeliveries,
      avgDeliveryTime: Math.round(avgDeliveryTime),
      pendingDeliveries:
        byStatus.pending +
        byStatus.confirmed +
        byStatus.preparing +
        byStatus.out_for_delivery,
      byStatus,
      period: `${days} days`,
    },
  });
});

// ─────────────────────────────────────────
//  GET /api/reports/customer-ltv
//  Get customer lifetime value metrics
// ─────────────────────────────────────────
exports.getCustomerLTV = asyncHandler(async (req, res) => {
  // Get all users with their orders
  const users = await prisma.user.findMany({
    where: {
      orders: { some: {} },
    },
    include: {
      orders: {
        where: { status: { not: "cancelled" } },
        select: { total: true, createdAt: true },
      },
    },
  });

  const ltvData = users.map((user) => {
    const totalSpent = user.orders.reduce((sum, o) => sum + Number(o.total), 0);
    const orderCount = user.orders.length;
    const avgOrderValue = orderCount > 0 ? totalSpent / orderCount : 0;
    const firstOrder = user.orders[0]?.createdAt;
    const lastOrder = user.orders[user.orders.length - 1]?.createdAt;

    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      totalSpent,
      orderCount,
      avgOrderValue,
      firstOrder,
      lastOrder,
    };
  });

  // Sort by total spent
  const topCustomers = [...ltvData]
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, 10);

  // Calculate averages
  const avgLTV =
    ltvData.reduce((sum, c) => sum + c.totalSpent, 0) / (ltvData.length || 1);
  const avgOrders =
    ltvData.reduce((sum, c) => sum + c.orderCount, 0) / (ltvData.length || 1);

  res.status(200).json({
    success: true,
    data: {
      summary: {
        totalCustomers: ltvData.length,
        averageLTV: avgLTV,
        averageOrderCount: avgOrders,
        totalRevenue: ltvData.reduce((sum, c) => sum + c.totalSpent, 0),
      },
      topCustomers,
      allCustomers: ltvData,
    },
  });
});
