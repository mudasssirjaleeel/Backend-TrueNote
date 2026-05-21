const prisma = require("../config/prisma");

// Get user permissions based on role
const getUserPermissions = async (userId, userRole) => {
  // Super admin (legacy admin role) gets all permissions
  if (userRole === "admin") {
    const allPermissions = await prisma.rolePermission.findMany({
      select: { permission: true },
    });
    return {
      role: "super_admin",
      permissions: allPermissions.map((p) => p.permission),
    };
  }

  // Get staff record
  const staff = await prisma.staff.findUnique({
    where: { userId },
    select: { role: true, isActive: true },
  });

  if (!staff || !staff.isActive) {
    return { role: null, permissions: [] };
  }

  // Get permissions for the role
  const permissions = await prisma.rolePermission.findMany({
    where: { role: staff.role },
    select: { permission: true },
  });

  return {
    role: staff.role,
    permissions: permissions.map((p) => p.permission),
  };
};

// Check if user has specific permission
const hasPermission = async (userId, permission) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (user?.role === "admin") {
    return true;
  }

  const staff = await prisma.staff.findUnique({
    where: { userId },
    select: { role: true, isActive: true },
  });

  if (!staff || !staff.isActive) {
    return false;
  }

  const rolePermission = await prisma.rolePermission.findUnique({
    where: {
      role_permission: {
        role: staff.role,
        permission: permission,
      },
    },
  });

  return !!rolePermission;
};

module.exports = {
  getUserPermissions,
  hasPermission,
};
