const prisma = require("../config/prisma");
const {
  sendOrderStatusEmail,
  sendSubscriptionRenewalEmail,
  sendSubscriptionPaymentFailedEmail,
} = require("./emailService");

// Order status notification messages
const ORDER_NOTIFICATIONS = {
  confirmed: {
    title: "Order Confirmed",
    body: (orderNumber) => `Your order #${orderNumber} has been confirmed.`,
  },
  preparing: {
    title: "Preparing Your Order",
    body: (orderNumber) => `Your order #${orderNumber} is now being prepared.`,
  },
  ready: {
    title: "Order Ready!",
    body: (orderNumber) => `Your order #${orderNumber} is ready for pickup.`,
  },
  out_for_delivery: {
    title: "Order Out for Delivery",
    body: (orderNumber) => `Your order #${orderNumber} is out for delivery!`,
  },
  delivered: {
    title: "Order Delivered!",
    body: (orderNumber) =>
      `Your order #${orderNumber} has been delivered. Enjoy!`,
  },
  cancelled: {
    title: "Order Cancelled",
    body: (orderNumber) => `Your order #${orderNumber} has been cancelled.`,
  },
};

// Save notification to database
const saveNotification = async (userId, title, body, type, data = {}) => {
  await prisma.notificationLog.create({
    data: {
      userId,
      title,
      body,
      type,
      data,
    },
  });
};

// Send order status notification
const sendOrderStatusNotification = async (order, status, user) => {
  const orderNumber = order.id.slice(-8).toUpperCase();
  const notification = ORDER_NOTIFICATIONS[status];
  console.log("🔔 sendOrderStatusNotification called for status:", status);
  console.log("🔔 Order:", order.id);
  console.log("🔔 User:", user?.email);

  if (!notification) {
    console.log("❌ No notification template for status:", status);
    return;
  }

  console.log("✅ Notification template found, sending email...");

  const title = notification.title;
  const body = notification.body(orderNumber);

  // 1. Save to database (for in-app notification center)
  await saveNotification(user.id, title, body, "order_status", {
    orderId: order.id,
    status: status,
    orderNumber: orderNumber,
  });

  // 2. Send real email
  await sendOrderStatusEmail({
    to: user.email,
    name: user.name,
    orderNumber: orderNumber,
    status: status,
    total: Number(order.total),
    orderId: order.id,
  });

  console.log(`📧 Notification sent to ${user.email}: ${title} - ${body}`);
};

const sendAdminNotification = async (title, body, type, data = {}) => {
  const admins = await prisma.user.findMany({
    where: { role: "admin" },
    select: { id: true },
  });

  for (const admin of admins) {
    await prisma.notificationLog.create({
      data: {
        userId: admin.id,
        title,
        body,
        type: type || "admin_alert",
        data,
      },
    });
  }

  console.log(`🔔 Admin notification sent: ${title}`);
};

// Send subscription renewal notification
const sendSubscriptionRenewalNotification = async (subscription, user) => {
  const subNumber = subscription.id.slice(-8).toUpperCase();

  const title = "🔄 Subscription Renewed";
  const body = `Your subscription #${subNumber} has been renewed.`;

  // Save to database
  await saveNotification(user.id, title, body, "subscription", {
    subscriptionId: subscription.id,
    type: "renewed",
  });

  // Send email
  await sendSubscriptionRenewalEmail({
    to: user.email,
    name: user.name,
    subscriptionNumber: subNumber,
    nextDeliveryDate: subscription.nextDeliveryDate,
    price: Number(subscription.price),
  });

  console.log(`📧 Subscription renewal sent to ${user.email}`);
};

// Send subscription payment failed notification
const sendSubscriptionPaymentFailedNotification = async (
  subscription,
  user,
) => {
  const subNumber = subscription.id.slice(-8).toUpperCase();

  const title = "⚠️ Payment Failed";
  const body = `Payment failed for subscription #${subNumber}. Please update your payment method.`;

  // Save to database for customer
  await saveNotification(user.id, title, body, "subscription", {
    subscriptionId: subscription.id,
    type: "payment_failed",
  });

  // Send email to customer
  await sendSubscriptionPaymentFailedEmail({
    to: user.email,
    name: user.name,
    subscriptionNumber: subNumber,
    price: Number(subscription.price),
  });

  // Also notify admin
  const admins = await prisma.user.findMany({
    where: { role: "admin" },
    select: { id: true },
  });

  for (const admin of admins) {
    await saveNotification(admin.id, title, body, "admin_alert", {
      subscriptionId: subscription.id,
      type: "payment_failed",
      customer: user.email,
    });
  }

  console.log(
    `📧 Payment failed notification sent for subscription #${subNumber}`,
  );
};

module.exports = {
  saveNotification,
  sendOrderStatusNotification,
  sendAdminNotification,
  sendSubscriptionRenewalNotification,
  sendSubscriptionPaymentFailedNotification,
  ORDER_NOTIFICATIONS,
};
