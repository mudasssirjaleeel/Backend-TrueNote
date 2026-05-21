const prisma = require("../config/prisma");
const asyncHandler = require("../utils/asyncHandler");
const bcrypt = require("bcryptjs");
const { sendStaffInvitationEmail } = require("../services/emailService");

const generateTempPassword = () => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$_&";
  let pass = "";
  for (let i = 0; i < 12; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
};

// Helper to create audit log
const createAuditLog = async (
  staffId,
  action,
  targetType = null,
  targetId = null,
  oldValue = null,
  newValue = null,
  req = null,
) => {
  await prisma.staffAuditLog.create({
    data: {
      staffId,
      action,
      targetType,
      targetId,
      oldValue,
      newValue,
      ipAddress: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.headers?.["user-agent"],
    },
  });
};

// ─────────────────────────────────────────
//  POST /api/admin/staff/invite
// ─────────────────────────────────────────
exports.inviteStaff = asyncHandler(async (req, res) => {
  const { email, name, role, phone } = req.body;
  const inviterId = req.user.id;

  const validRoles = ["admin", "manager", "barista", "counter", "rider"];
  if (!validRoles.includes(role)) {
    return res.status(400).json({
      error: {
        code: "INVALID_ROLE",
        message: `Role must be one of: ${validRoles.join(", ")}`,
      },
    });
  }

  let user = await prisma.user.findUnique({ where: { email } });

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  if (!user) {
    user = await prisma.user.create({
      data: {
        name: name || email.split("@")[0],
        email,
        phone: phone || null,
        passwordHash,
        role: "staff",
      },
    });
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
  }

  // Create or update Staff record
  let staff = await prisma.staff.findUnique({ where: { userId: user.id } });

  if (!staff) {
    staff = await prisma.staff.create({
      data: {
        userId: user.id,
        role,
        invitedBy: inviterId,
        isActive: true,
      },
    });
  } else {
    await prisma.staff.update({
      where: { id: staff.id },
      data: { role, isActive: true },
    });
  }

  // Send Invitation Email
  const loginUrl = `${process.env.FRONTEND_ADMIN_URL}/login`;

  await sendStaffInvitationEmail({
    to: email,
    name: user.name,
    email: user.email,
    tempPassword,
    loginUrl,
    role: role.replace("_", " ").toUpperCase(),
  });

  // Audit Log
  await createAuditLog(
    staff.id,
    "invite",
    "staff",
    staff.id,
    null,
    { role, email },
    req,
  );

  res.status(201).json({
    success: true,
    message: `Invitation sent successfully to ${email}`,
  });
});

// ─────────────────────────────────────────
//  GET /api/admin/staff
// ─────────────────────────────────────────
exports.getAllStaff = asyncHandler(async (req, res) => {
  const { role, isActive, page = 1, limit = 20, search } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  let where = {};

  if (role) where.role = role;
  if (isActive !== undefined) where.isActive = isActive === "true";
  if (search) {
    where.OR = [
      { user: { name: { contains: search, mode: "insensitive" } } },
      { user: { email: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [staff, total] = await prisma.$transaction([
    prisma.staff.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatarUrl: true,
            createdAt: true,
          },
        },
        inviter: {
          select: { name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: Number(limit),
    }),
    prisma.staff.count({ where }),
  ]);

  res.status(200).json({
    success: true,
    data: staff,
    total,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil(total / Number(limit)),
  });
});

// ─────────────────────────────────────────
//  GET /api/admin/staff/:id
// ─────────────────────────────────────────
exports.getStaffById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const staff = await prisma.staff.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          avatarUrl: true,
          createdAt: true,
        },
      },
      inviter: {
        select: { name: true, email: true },
      },
    },
  });

  if (!staff) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Staff member not found" },
    });
  }

  const auditLogs = await prisma.staffAuditLog.findMany({
    where: { staffId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  res.status(200).json({
    success: true,
    data: { ...staff, auditLogs },
  });
});

// ─────────────────────────────────────────
//  PATCH /api/admin/staff/:id/role
// ─────────────────────────────────────────
exports.updateStaffRole = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  const validRoles = ["super_admin", "manager", "barista", "counter", "rider"];
  if (!validRoles.includes(role)) {
    return res.status(400).json({
      error: {
        code: "INVALID_ROLE",
        message: `Role must be one of: ${validRoles.join(", ")}`,
      },
    });
  }

  const staff = await prisma.staff.findUnique({
    where: { id },
    include: { user: true },
  });

  if (!staff) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Staff member not found" },
    });
  }

  const oldRole = staff.role;
  const updatedStaff = await prisma.staff.update({
    where: { id },
    data: { role },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  await createAuditLog(
    staff.id,
    "role_change",
    "staff",
    staff.id,
    { role: oldRole },
    { role },
    req,
  );

  res.status(200).json({
    success: true,
    message: `Role updated from ${oldRole} to ${role}`,
    data: updatedStaff,
  });
});

// PATCH /api/admin/staff/:id/deactivate
exports.deactivateStaff = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const staff = await prisma.staff.findUnique({
    where: { id },
    include: { user: true },
  });

  if (!staff) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Staff member not found" },
    });
  }

  if (!staff.isActive) {
    return res.status(400).json({
      error: {
        code: "ALREADY_INACTIVE",
        message: "Staff member is already inactive",
      },
    });
  }

  // Deactivate staff record
  const updatedStaff = await prisma.staff.update({
    where: { id },
    data: { isActive: false },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  // Optionally: Also deactivate user account by setting a flag
  // You can add a 'isActive' field to User model if needed

  await createAuditLog(
    staff.id,
    "deactivate",
    "staff",
    staff.id,
    { isActive: true },
    { isActive: false },
    req,
  );

  res.status(200).json({
    success: true,
    message: "Staff member deactivated",
    data: updatedStaff,
  });
});

// ─────────────────────────────────────────
//  PATCH /api/admin/staff/:id/activate
// ─────────────────────────────────────────
exports.activateStaff = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const staff = await prisma.staff.findUnique({
    where: { id },
    include: { user: true },
  });

  if (!staff) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Staff member not found" },
    });
  }

  if (staff.isActive) {
    return res.status(400).json({
      error: {
        code: "ALREADY_ACTIVE",
        message: "Staff member is already active",
      },
    });
  }

  const updatedStaff = await prisma.staff.update({
    where: { id },
    data: { isActive: true },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  await createAuditLog(
    staff.id,
    "activate",
    "staff",
    staff.id,
    { isActive: false },
    { isActive: true },
    req,
  );

  res.status(200).json({
    success: true,
    message: "Staff member activated",
    data: updatedStaff,
  });
});

// DELETE /api/admin/staff/:id
exports.removeStaff = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const staff = await prisma.staff.findUnique({
    where: { id },
    include: { user: true },
  });

  if (!staff) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Staff member not found" },
    });
  }

  // Prevent deleting yourself
  if (staff.userId === req.user.id) {
    return res.status(400).json({
      error: {
        code: "CANNOT_DELETE_SELF",
        message: "You cannot delete your own staff account",
      },
    });
  }

  // Create audit log before deleting
  await createAuditLog(staff.id, "delete", "staff", staff.id, null, null, req);

  // Delete staff record first
  await prisma.staff.delete({
    where: { id },
  });

  // Also delete the user account
  await prisma.user.delete({
    where: { id: staff.userId },
  });

  res.status(200).json({
    success: true,
    message: "Staff member and user account removed successfully",
  });
});

// ─────────────────────────────────────────
//  GET /api/admin/staff/:id/audit
// ─────────────────────────────────────────
exports.getStaffAudit = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const staff = await prisma.staff.findUnique({
    where: { id },
  });

  if (!staff) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Staff member not found" },
    });
  }

  const [logs, total] = await prisma.$transaction([
    prisma.staffAuditLog.findMany({
      where: { staffId: id },
      orderBy: { createdAt: "desc" },
      skip,
      take: Number(limit),
    }),
    prisma.staffAuditLog.count({ where: { staffId: id } }),
  ]);

  res.status(200).json({
    success: true,
    data: logs,
    total,
    page: Number(page),
    limit: Number(limit),
  });
});

// ─────────────────────────────────────────
//  GET /api/admin/permissions/roles
//  Get all roles with their permissions
// ─────────────────────────────────────────
exports.getAllRolesWithPermissions = asyncHandler(async (req, res) => {
  const roles = ["super_admin", "manager", "barista", "counter", "rider"];

  const allPermissions = await prisma.rolePermission.findMany();

  const result = roles.map((role) => ({
    role,
    permissions: allPermissions
      .filter((p) => p.role === role)
      .map((p) => p.permission),
  }));

  res.status(200).json({
    success: true,
    data: result,
  });
});

// ─────────────────────────────────────────
//  GET /api/admin/permissions/all
//  Get all available permissions grouped by module
// ─────────────────────────────────────────
exports.getAllPermissions = asyncHandler(async (req, res) => {
  const permissionsByModule = {
    Dashboard: ["view_dashboard"],
    Orders: [
      "view_orders",
      "update_order_status",
      "cancel_order",
      "view_all_orders",
    ],
    "Kitchen Display": ["view_kds", "advance_order_status", "recall_order"],
    Menu: ["view_menu", "edit_menu", "toggle_availability"],
    Beans: ["view_beans", "edit_beans"],
    Categories: ["view_categories", "edit_categories"],
    Banners: ["view_banners", "edit_banners"],
    Subscriptions: ["view_subscriptions", "manage_subscriptions"],
    Customers: [
      "view_customers",
      "manage_customers",
      "view_loyalty",
      "adjust_loyalty_points",
    ],
    Reports: ["view_reports", "export_reports"],
    Staff: ["view_staff", "invite_staff", "manage_staff_roles"],
    Settings: ["view_settings", "edit_settings"],
  };

  res.status(200).json({
    success: true,
    data: permissionsByModule,
  });
});

// ─────────────────────────────────────────
//  PUT /api/admin/permissions/roles/:role
//  Update permissions for a specific role
// ─────────────────────────────────────────
exports.updateRolePermissions = asyncHandler(async (req, res) => {
  const { role } = req.params;
  const { permissions } = req.body;

  const validRoles = ["super_admin", "manager", "barista", "counter", "rider"];
  if (!validRoles.includes(role)) {
    return res.status(400).json({
      error: { code: "INVALID_ROLE", message: "Invalid role" },
    });
  }

  try {
    // Delete all existing permissions for this role
    await prisma.rolePermission.deleteMany({
      where: { role },
    });

    // Create new permissions
    const createdPermissions = [];
    for (const permission of permissions) {
      const result = await prisma.rolePermission.create({
        data: {
          role: role,
          permission: permission,
        },
      });
      createdPermissions.push(result);
    }

    console.log(
      `Permissions updated for ${role}: ${createdPermissions.length} permissions`,
    );

    res.status(200).json({
      success: true,
      message: `Permissions updated for ${role}`,
      data: createdPermissions,
    });
  } catch (error) {
    console.error("Error updating permissions:", error);
    res.status(500).json({
      error: {
        code: "UPDATE_FAILED",
        message: error.message,
      },
    });
  }
});
