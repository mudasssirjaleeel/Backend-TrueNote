const prisma = require("../config/prisma");
const asyncHandler = require("../utils/asyncHandler");

// ─────────────────────────────────────────
//  POST /api/notifications/register-token
//  Register device token for push notifications
// ─────────────────────────────────────────
exports.registerDeviceToken = asyncHandler(async (req, res) => {
  const { token, deviceType, deviceName, appVersion } = req.body;
  const userId = req.user.id;

  if (!token) {
    return res.status(400).json({
      error: { code: "MISSING_TOKEN", message: "Device token is required" },
    });
  }

  // Check if token already exists
  const existingToken = await prisma.deviceToken.findUnique({
    where: { token },
  });

  if (existingToken) {
    await prisma.deviceToken.update({
      where: { token },
      data: { userId, isActive: true, lastUsedAt: new Date() },
    });
  } else {
    await prisma.deviceToken.create({
      data: {
        userId,
        token,
        deviceType,
        deviceName,
        appVersion,
        isActive: true,
      },
    });
  }

  res.status(200).json({
    success: true,
    message: "Device token registered successfully",
  });
});

// ─────────────────────────────────────────
//  POST /api/notifications/unregister-token
//  Unregister device token
// ─────────────────────────────────────────
exports.unregisterDeviceToken = asyncHandler(async (req, res) => {
  const { token } = req.body;
  const userId = req.user.id;

  if (!token) {
    return res.status(400).json({
      error: { code: "MISSING_TOKEN", message: "Device token is required" },
    });
  }

  await prisma.deviceToken.updateMany({
    where: { token, userId },
    data: { isActive: false },
  });

  res.status(200).json({
    success: true,
    message: "Device token unregistered",
  });
});

// ─────────────────────────────────────────
//  GET /api/notifications
//  Get user notifications with pagination
// ─────────────────────────────────────────
exports.getUserNotifications = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, unreadOnly = false } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const where = {
    userId: req.user.id,
    ...(unreadOnly === "true" && { isRead: false }),
  };

  const [notifications, total] = await prisma.$transaction([
    prisma.notificationLog.findMany({
      where,
      orderBy: { sentAt: "desc" },
      skip,
      take: Number(limit),
    }),
    prisma.notificationLog.count({ where }),
  ]);

  const unreadCount = await prisma.notificationLog.count({
    where: { userId: req.user.id, isRead: false },
  });

  res.status(200).json({
    success: true,
    data: notifications,
    total,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil(total / Number(limit)),
    unreadCount,
  });
});

// ─────────────────────────────────────────
//  GET /api/notifications/unread-count
//  Get unread notification count (for badge)
// ─────────────────────────────────────────
exports.getUnreadCount = asyncHandler(async (req, res) => {
  const unreadCount = await prisma.notificationLog.count({
    where: { userId: req.user.id, isRead: false },
  });

  res.status(200).json({
    success: true,
    unreadCount,
  });
});

// ─────────────────────────────────────────
//  PATCH /api/notifications/:id/read
//  Mark single notification as read
// ─────────────────────────────────────────
exports.markAsRead = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const notification = await prisma.notificationLog.findFirst({
    where: { id, userId: req.user.id },
  });

  if (!notification) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Notification not found" },
    });
  }

  await prisma.notificationLog.update({
    where: { id },
    data: { isRead: true, readAt: new Date() },
  });

  res.status(200).json({
    success: true,
    message: "Notification marked as read",
  });
});

// ─────────────────────────────────────────
//  POST /api/notifications/mark-all-read
//  Mark all notifications as read
// ─────────────────────────────────────────
exports.markAllAsRead = asyncHandler(async (req, res) => {
  await prisma.notificationLog.updateMany({
    where: { userId: req.user.id, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });

  res.status(200).json({
    success: true,
    message: "All notifications marked as read",
  });
});
