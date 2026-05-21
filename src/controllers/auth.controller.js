const bcrypt = require("bcryptjs");
const prisma = require("../config/prisma");
const { getUserPermissions } = require("../utils/permissions");

const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} = require("../utils/jwt");
const asyncHandler = require("../utils/asyncHandler");

// Helper — save refresh token to DB
const saveRefreshToken = async (userId, token) => {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
    data: { token, userId, expiresAt },
  });
};

// ─────────────────────────────────────────
//  POST /api/auth/register
// ─────────────────────────────────────────
exports.register = asyncHandler(async (req, res) => {
  const { name, email, phone, password } = req.body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing)
    return res.status(409).json({
      error: {
        code: "EMAIL_EXISTS",
        message: "This email is already registered",
      },
    });

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: { name, email, phone, passwordHash },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      createdAt: true,
    },
  });

  const accessToken = generateAccessToken({ id: user.id, role: user.role });
  const refreshToken = generateRefreshToken({ id: user.id });
  await saveRefreshToken(user.id, refreshToken);

  res.status(201).json({
    user,
    accessToken,
    refreshToken,
  });
});

// ─────────────────────────────────────────
//  POST /api/auth/login
// ─────────────────────────────────────────
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user)
    return res.status(401).json({
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password",
      },
    });

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch)
    return res.status(401).json({
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password",
      },
    });

  const { passwordHash, ...safeUser } = user;

  const accessToken = generateAccessToken({ id: user.id, role: user.role });
  const refreshToken = generateRefreshToken({ id: user.id });
  await saveRefreshToken(user.id, refreshToken);

  const permissionsData = await getUserPermissions(user.id, user.role);

  res.status(200).json({
    user: {
      ...safeUser,
      permissions: permissionsData.permissions,
      roleName: permissionsData.role || user.role,
    },
    accessToken,
    refreshToken,
  });
});

// ─────────────────────────────────────────
//  POST /api/auth/logout
// ─────────────────────────────────────────
exports.logout = asyncHandler(async (req, res) => {
  await prisma.refreshToken.deleteMany({
    where: { userId: req.user.id },
  });

  res.status(200).json({ success: true });
});

// ─────────────────────────────────────────
//  POST /api/auth/refresh
// ─────────────────────────────────────────
exports.refresh = asyncHandler(async (req, res) => {
  const { refresh_token } = req.body;

  if (!refresh_token)
    return res.status(400).json({
      error: {
        code: "MISSING_TOKEN",
        message: "refresh_token is required",
      },
    });

  let payload;
  try {
    payload = verifyRefreshToken(refresh_token);
  } catch {
    return res.status(401).json({
      error: {
        code: "INVALID_REFRESH_TOKEN",
        message: "Refresh token is invalid or expired",
      },
    });
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { token: refresh_token },
  });

  if (!stored || stored.expiresAt < new Date())
    return res.status(401).json({
      error: {
        code: "REFRESH_TOKEN_EXPIRED",
        message: "Refresh token expired — please login again",
      },
    });

  // Rotate — delete old, issue new
  await prisma.refreshToken.delete({ where: { token: refresh_token } });

  const user = await prisma.user.findUnique({ where: { id: payload.id } });
  if (!user)
    return res.status(401).json({
      error: {
        code: "USER_NOT_FOUND",
        message: "User no longer exists",
      },
    });

  const accessToken = generateAccessToken({ id: user.id, role: user.role });
  const newRefreshToken = generateRefreshToken({ id: user.id });
  await saveRefreshToken(user.id, newRefreshToken);

  res.status(200).json({
    accessToken,
    refreshToken: newRefreshToken,
  });
});

// ─────────────────────────────────────────
//  GET /api/auth/me
// ─────────────────────────────────────────
exports.getMe = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      avatarUrl: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user)
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "User not found" },
    });

  const permissionsData = await getUserPermissions(user.id, user.role);

  res.status(200).json({
    user: {
      ...user,
      permissions: permissionsData.permissions,
      roleName: permissionsData.role || user.role,
    },
  });
});

// ─────────────────────────────────────────
//  PUT /api/auth/update-profile
// ─────────────────────────────────────────
exports.updateProfile = asyncHandler(async (req, res) => {
  const { name, email, phone } = req.body;

  if (email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== req.user.id)
      return res.status(409).json({
        error: { code: "EMAIL_EXISTS", message: "Email already in use" },
      });
  }

  const data = {
    ...(name !== undefined && { name }),
    ...(email !== undefined && { email }),
    ...(phone !== undefined && { phone }),
  };

  if (req.file) data.avatarUrl = req.file.filename;

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      avatarUrl: true,
      updatedAt: true,
    },
  });

  if (user.avatarUrl && !user.avatarUrl.startsWith("http")) {
    user.avatarUrl = `${req.protocol}://${req.get("host")}/api/uploads/${user.avatarUrl}`;
  }

  res.status(200).json({ user });
});

// ─────────────────────────────────────────
//  PUT /api/auth/change-password
// ─────────────────────────────────────────
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });

  const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isMatch)
    return res.status(401).json({
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Current password is incorrect",
      },
    });

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: req.user.id },
    data: { passwordHash },
  });

  res.status(200).json({ success: true });
});

// ─────────────────────────────────────────
//  POST /api/auth/otp/request
// ─────────────────────────────────────────
exports.requestOtp = asyncHandler(async (req, res) => {
  const { phone } = req.body;

  // Check if user exists with this phone
  let user = await prisma.user.findUnique({ where: { phone } });

  if (!user) {
    // Auto-create new user with phone only
    const timestamp = Date.now().toString().slice(-6);
    user = await prisma.user.create({
      data: {
        name: `User_${timestamp}`,
        phone,
        email: null, // Email is optional now
        passwordHash: "", // No password for phone-only users
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    });
  }

  // Generate 6-digit OTP
  const { generateOtp } = require("../utils/otp");
  const otpCode = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

  // Delete any existing OTP for this phone
  await prisma.otp.deleteMany({ where: { phone } });

  // Save OTP to database
  await prisma.otp.create({
    data: {
      phone,
      otp: otpCode,
      expiresAt,
    },
  });

  // TODO: Send OTP via SMS service (Twilio, etc.)
  console.log(`OTP for ${phone}: ${otpCode}`); // For development

  res.status(200).json({
    success: true,
    message: "OTP sent successfully",
    // Remove in production
    devOtp: process.env.NODE_ENV === "development" ? otpCode : undefined,
  });
});

// ─────────────────────────────────────────
//  POST /api/auth/otp/verify
// ─────────────────────────────────────────
exports.verifyOtp = asyncHandler(async (req, res) => {
  const { phone, otp } = req.body;

  // Find valid OTP
  const otpRecord = await prisma.otp.findFirst({
    where: {
      phone,
      otp,
      expiresAt: { gt: new Date() },
    },
  });

  if (!otpRecord) {
    return res.status(401).json({
      error: {
        code: "INVALID_OTP",
        message: "Invalid or expired OTP",
      },
    });
  }

  // Get user
  const user = await prisma.user.findUnique({ where: { phone } });

  if (!user) {
    return res.status(404).json({
      error: {
        code: "USER_NOT_FOUND",
        message: "User not found",
      },
    });
  }

  // Delete used OTP
  await prisma.otp.delete({ where: { id: otpRecord.id } });

  // Generate tokens
  const accessToken = generateAccessToken({ id: user.id, role: user.role });
  const refreshToken = generateRefreshToken({ id: user.id });
  await saveRefreshToken(user.id, refreshToken);

  const { passwordHash, ...safeUser } = user;

  res.status(200).json({
    user: safeUser,
    accessToken,
    refreshToken,
  });
});

// Delete User (Admin only)
exports.deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  console.log("Attempting to delete user:", id);

  // Find the user
  const user = await prisma.user.findUnique({
    where: { id },
  });

  if (!user) {
    console.log("User not found:", id);
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "User not found" },
    });
  }

  console.log("User found:", user.email, "Role:", user.role);

  // Prevent deleting admin accounts
  if (user.role === "admin") {
    console.log("Blocked - cannot delete admin");
    return res.status(403).json({
      error: { code: "FORBIDDEN", message: "Cannot delete admin accounts" },
    });
  }

  // Check if user has staff record
  const staffRecord = await prisma.staff.findUnique({
    where: { userId: id },
  });

  if (staffRecord) {
    console.log("Deleting staff record first");
    await prisma.staff.delete({
      where: { id: staffRecord.id },
    });
  }

  // Delete the user
  console.log("Deleting user...");
  await prisma.user.delete({
    where: { id },
  });

  console.log("User deleted successfully");
  res.status(200).json({
    success: true,
    message: "User has been deleted successfully",
  });
});
