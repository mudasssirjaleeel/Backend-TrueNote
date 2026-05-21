const prisma = require("../config/prisma");
const asyncHandler = require("../utils/asyncHandler");

// ─────────────────────────────────────────
//  HELPER FUNCTIONS
// ─────────────────────────────────────────

const getTotalPoints = async (userId) => {
  const result = await prisma.loyaltyPoint.aggregate({
    where: { userId },
    _sum: { points: true },
  });
  return result._sum.points || 0;
};

const getEarnedBadges = async (totalPoints) => {
  const badges = [
    { id: "bronze", name: "Bronze Member", minPoints: 0, maxPoints: 499 },
    { id: "silver", name: "Silver Member", minPoints: 500, maxPoints: 999 },
    { id: "gold", name: "Gold Member", minPoints: 1000, maxPoints: 1999 },
    {
      id: "platinum",
      name: "Platinum Member",
      minPoints: 2000,
      maxPoints: Infinity,
    },
  ];

  let currentBadge = badges[0];
  let nextMilestone = badges[1];

  for (let i = badges.length - 1; i >= 0; i--) {
    if (totalPoints >= badges[i].minPoints) {
      currentBadge = badges[i];
      nextMilestone = badges[i + 1] || null;
      break;
    }
  }

  return {
    currentBadge: currentBadge.name,
    targetPoints: nextMilestone ? nextMilestone.minPoints : totalPoints,
    nextMilestone: nextMilestone ? nextMilestone.name : null,
    nextMilestonePoints: nextMilestone ? nextMilestone.minPoints : totalPoints,
    totalBadges: badges.length,
    earnedBadges: badges.filter((b) => totalPoints >= b.minPoints).length,
  };
};

// ─────────────────────────────────────────
//  USER APIS
// ─────────────────────────────────────────

// GET /api/loyalty - Get current user loyalty info
exports.getLoyaltyInfo = asyncHandler(async (req, res) => {
  const currentPoints = await getTotalPoints(req.user.id);
  const badgeInfo = await getEarnedBadges(currentPoints);

  const rewards = await prisma.reward.findMany({
    where: { isActive: true },
    select: { id: true, title: true, description: true, pointsCost: true },
    orderBy: { pointsCost: "asc" },
  });

  const earnActions = await prisma.earnAction.findMany({
    where: { isActive: true },
    select: { id: true, title: true, pointsEarned: true },
    orderBy: { pointsEarned: "asc" },
  });

  res.status(200).json({
    current_points: currentPoints,
    target_points: badgeInfo.targetPoints,
    next_milestone: badgeInfo.nextMilestone,
    next_milestone_label: badgeInfo.nextMilestone
      ? `${badgeInfo.nextMilestone} Member`
      : "Max Level",
    total_badges: badgeInfo.totalBadges,
    earned_badges: badgeInfo.earnedBadges,
    current_badge: badgeInfo.currentBadge,
    redeem_rewards: rewards,
    earn_actions: earnActions,
  });
});

// POST /api/loyalty/redeem - Redeem reward
exports.redeemReward = asyncHandler(async (req, res) => {
  const { reward_id } = req.body;

  if (!reward_id) {
    return res.status(400).json({
      error: { code: "MISSING_REWARD_ID", message: "reward_id is required" },
    });
  }

  const reward = await prisma.reward.findUnique({
    where: { id: reward_id, isActive: true },
  });

  if (!reward) {
    return res.status(404).json({
      error: { code: "REWARD_NOT_FOUND", message: "Reward not found" },
    });
  }

  const currentPoints = await getTotalPoints(req.user.id);

  if (currentPoints < reward.pointsCost) {
    return res.status(400).json({
      error: {
        code: "INSUFFICIENT_POINTS",
        message: `Insufficient points. Need ${reward.pointsCost} points, you have ${currentPoints}`,
      },
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.redemption.create({
      data: {
        userId: req.user.id,
        rewardId: reward_id,
        pointsSpent: reward.pointsCost,
      },
    });

    await tx.loyaltyPoint.create({
      data: {
        userId: req.user.id,
        points: -reward.pointsCost,
        source: "redemption",
        sourceId: reward_id,
      },
    });
  });

  const remainingPoints = await getTotalPoints(req.user.id);

  res.status(200).json({
    success: true,
    remaining_points: remainingPoints,
    message: `Successfully redeemed ${reward.title}`,
  });
});

// GET /api/loyalty/earn-actions - List earn actions with completion status
exports.getEarnActions = asyncHandler(async (req, res) => {
  const earnActions = await prisma.earnAction.findMany({
    where: { isActive: true },
    select: {
      id: true,
      title: true,
      pointsEarned: true,
      actionKey: true,
      maxPerUser: true,
    },
    orderBy: { pointsEarned: "asc" },
  });

  const userActions = await prisma.userEarnAction.findMany({
    where: { userId: req.user.id },
    select: { earnActionId: true },
  });

  const completedActionIds = new Set(userActions.map((ua) => ua.earnActionId));

  const actionsWithStatus = earnActions.map((action) => ({
    id: action.id,
    title: action.title,
    points_earned: action.pointsEarned,
    is_completed: completedActionIds.has(action.id),
    max_per_user: action.maxPerUser,
  }));

  res.status(200).json({ earn_actions: actionsWithStatus });
});

// ─────────────────────────────────────────
//  ADMIN APIS
// ─────────────────────────────────────────

// GET /api/admin/loyalty/users - Get all users with loyalty points
exports.adminGetAllUsersLoyalty = asyncHandler(async (req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      createdAt: true,
      loyaltyPoints: {
        select: { points: true, source: true, createdAt: true },
      },
      redemptions: {
        select: {
          pointsSpent: true,
          reward: { select: { title: true } },
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const usersWithPoints = users.map((user) => {
    const totalPoints = user.loyaltyPoints.reduce(
      (sum, point) => sum + point.points,
      0,
    );
    const totalRedeemed = user.redemptions.reduce(
      (sum, redemption) => sum + redemption.pointsSpent,
      0,
    );

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      total_points: totalPoints,
      total_redeemed: totalRedeemed,
      net_points: totalPoints - totalRedeemed,
      joined_at: user.createdAt,
      redemptions_count: user.redemptions.length,
    };
  });

  res.status(200).json({ users: usersWithPoints });
});

// GET /api/admin/loyalty/users/:userId - Get specific user loyalty details
exports.adminGetUserLoyalty = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      createdAt: true,
      loyaltyPoints: {
        select: { points: true, source: true, sourceId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
      redemptions: {
        include: { reward: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!user) {
    return res.status(404).json({
      error: { code: "USER_NOT_FOUND", message: "User not found" },
    });
  }

  const totalPoints = user.loyaltyPoints.reduce(
    (sum, point) => sum + point.points,
    0,
  );
  const totalRedeemed = user.redemptions.reduce(
    (sum, redemption) => sum + redemption.pointsSpent,
    0,
  );
  const badgeInfo = await getEarnedBadges(totalPoints - totalRedeemed);

  res.status(200).json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      joined_at: user.createdAt,
    },
    loyalty: {
      total_earned: totalPoints,
      total_redeemed: totalRedeemed,
      current_points: totalPoints - totalRedeemed,
      current_badge: badgeInfo.currentBadge,
      next_milestone: badgeInfo.nextMilestone,
      next_milestone_points: badgeInfo.nextMilestonePoints,
    },
    history: {
      points: user.loyaltyPoints,
      redemptions: user.redemptions,
    },
  });
});

// POST /api/admin/loyalty/users/:userId/points - Manually add/remove points
exports.adminAdjustPoints = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { points, reason } = req.body;

  if (!points || points === 0) {
    return res.status(400).json({
      error: {
        code: "INVALID_POINTS",
        message: "Points amount is required and cannot be 0",
      },
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return res.status(404).json({
      error: { code: "USER_NOT_FOUND", message: "User not found" },
    });
  }

  await prisma.loyaltyPoint.create({
    data: {
      userId,
      points,
      source: "admin_adjustment",
      sourceId: reason || "manual_adjustment",
    },
  });

  const currentPoints = await getTotalPoints(userId);

  res.status(200).json({
    success: true,
    message: `Added ${points} points to user`,
    current_points: currentPoints,
  });
});

// ─────────────────────────────────────────
//  REWARDS MANAGEMENT (ADMIN)
// ─────────────────────────────────────────

// GET /api/admin/loyalty/rewards - Get all rewards
exports.adminGetRewards = asyncHandler(async (req, res) => {
  const rewards = await prisma.reward.findMany({
    include: {
      _count: {
        select: { redemptions: true },
      },
    },
    orderBy: { pointsCost: "asc" },
  });

  res.status(200).json({ rewards });
});

// POST /api/admin/loyalty/rewards - Create reward
exports.adminCreateReward = asyncHandler(async (req, res) => {
  const { title, description, pointsCost, isActive } = req.body;

  if (!title || !pointsCost) {
    return res.status(400).json({
      error: {
        code: "MISSING_FIELDS",
        message: "Title and pointsCost are required",
      },
    });
  }

  const reward = await prisma.reward.create({
    data: {
      title,
      description,
      pointsCost,
      isActive: isActive !== undefined ? isActive : true,
    },
  });

  res.status(201).json({ reward });
});

// PUT /api/admin/loyalty/rewards/:rewardId - Update reward
exports.adminUpdateReward = asyncHandler(async (req, res) => {
  const { rewardId } = req.params;
  const { title, description, pointsCost, isActive } = req.body;

  const reward = await prisma.reward.findUnique({
    where: { id: rewardId },
  });

  if (!reward) {
    return res.status(404).json({
      error: { code: "REWARD_NOT_FOUND", message: "Reward not found" },
    });
  }

  const updatedReward = await prisma.reward.update({
    where: { id: rewardId },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(pointsCost !== undefined && { pointsCost }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  res.status(200).json({ reward: updatedReward });
});

// DELETE /api/admin/loyalty/rewards/:rewardId - Delete reward
exports.adminDeleteReward = asyncHandler(async (req, res) => {
  const { rewardId } = req.params;

  const reward = await prisma.reward.findUnique({
    where: { id: rewardId },
    include: { redemptions: true },
  });

  if (!reward) {
    return res.status(404).json({
      error: { code: "REWARD_NOT_FOUND", message: "Reward not found" },
    });
  }

  if (reward.redemptions.length > 0) {
    return res.status(400).json({
      error: {
        code: "REWARD_HAS_REDEMPTIONS",
        message: "Cannot delete reward that has been redeemed",
      },
    });
  }

  await prisma.reward.delete({
    where: { id: rewardId },
  });

  res.status(200).json({ success: true });
});

// ─────────────────────────────────────────
//  EARN ACTIONS MANAGEMENT (ADMIN)
// ─────────────────────────────────────────

// GET /api/admin/loyalty/earn-actions - Get all earn actions
exports.adminGetEarnActions = asyncHandler(async (req, res) => {
  const earnActions = await prisma.earnAction.findMany({
    include: {
      _count: {
        select: { userActions: true },
      },
    },
    orderBy: { pointsEarned: "asc" },
  });

  res.status(200).json({ earn_actions: earnActions });
});

// POST /api/admin/loyalty/earn-actions - Create earn action
exports.adminCreateEarnAction = asyncHandler(async (req, res) => {
  const { title, pointsEarned, actionKey, maxPerUser, isActive } = req.body;

  if (!title || !pointsEarned || !actionKey) {
    return res.status(400).json({
      error: {
        code: "MISSING_FIELDS",
        message: "Title, pointsEarned, and actionKey are required",
      },
    });
  }

  const earnAction = await prisma.earnAction.create({
    data: {
      title,
      pointsEarned,
      actionKey,
      maxPerUser: maxPerUser || 1,
      isActive: isActive !== undefined ? isActive : true,
    },
  });

  res.status(201).json({ earn_action: earnAction });
});

// PUT /api/admin/loyalty/earn-actions/:actionId - Update earn action
exports.adminUpdateEarnAction = asyncHandler(async (req, res) => {
  const { actionId } = req.params;
  const { title, pointsEarned, actionKey, maxPerUser, isActive } = req.body;

  const earnAction = await prisma.earnAction.findUnique({
    where: { id: actionId },
  });

  if (!earnAction) {
    return res.status(404).json({
      error: {
        code: "EARN_ACTION_NOT_FOUND",
        message: "Earn action not found",
      },
    });
  }

  const updatedAction = await prisma.earnAction.update({
    where: { id: actionId },
    data: {
      ...(title !== undefined && { title }),
      ...(pointsEarned !== undefined && { pointsEarned }),
      ...(actionKey !== undefined && { actionKey }),
      ...(maxPerUser !== undefined && { maxPerUser }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  res.status(200).json({ earn_action: updatedAction });
});

// DELETE /api/admin/loyalty/earn-actions/:actionId - Delete earn action
exports.adminDeleteEarnAction = asyncHandler(async (req, res) => {
  const { actionId } = req.params;

  const earnAction = await prisma.earnAction.findUnique({
    where: { id: actionId },
    include: { userActions: true },
  });

  if (!earnAction) {
    return res.status(404).json({
      error: {
        code: "EARN_ACTION_NOT_FOUND",
        message: "Earn action not found",
      },
    });
  }

  if (earnAction.userActions.length > 0) {
    return res.status(400).json({
      error: {
        code: "ACTION_HAS_USERS",
        message: "Cannot delete action that has been completed by users",
      },
    });
  }

  await prisma.earnAction.delete({
    where: { id: actionId },
  });

  res.status(200).json({ success: true });
});
