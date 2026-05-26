const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const prisma = require("../config/prisma");
const { getUserPermissions } = require("../utils/permissions");
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} = require("../utils/jwt");
const asyncHandler = require("../utils/asyncHandler");
const {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendOrderConfirmationEmail,
} = require("../services/emailService");

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

  // Send welcome email
  if (user.email) {
    await sendWelcomeEmail({ to: user.email, name: user.name });
  }

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
//  POST /api/auth/forgot-password (NEW)
// ─────────────────────────────────────────
exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });

  // Always return success — never reveal if email exists or not
  if (!user) {
    return res.status(200).json({
      success: true,
      message: "If that email exists, a reset link has been sent.",
    });
  }

  // Generate a secure random token
  const resetToken = crypto.randomBytes(32).toString("hex");
  const resetTokenHash = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Delete any existing reset tokens for this user
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

  // Save new hashed token to DB
  await prisma.passwordResetToken.create({
    data: { token: resetTokenHash, userId: user.id, expiresAt },
  });

  // Build reset URL (raw token goes in the URL, not the hash)
  const resetUrl = `${process.env.CLIENT_URL || "http://localhost:3000"}/reset-password?token=${resetToken}`;

  // Send email
  await sendPasswordResetEmail({
    to: user.email,
    name: user.name,
    resetUrl,
  });

  res.status(200).json({
    success: true,
    message: "If that email exists, a reset link has been sent.",
  });
});

// ─────────────────────────────────────────
//  POST /api/auth/reset-password (NEW)
// ─────────────────────────────────────────
exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({
      error: { code: "MISSING_FIELDS", message: "Token and new password are required." },
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      error: { code: "WEAK_PASSWORD", message: "Password must be at least 6 characters." },
    });
  }

  // Hash the incoming token to compare with what's in the DB
  const tokenHash = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  const record = await prisma.passwordResetToken.findUnique({
    where: { token: tokenHash },
  });

  if (!record || record.expiresAt < new Date()) {
    return res.status(400).json({
      error: {
        code: "INVALID_TOKEN",
        message: "Reset link is invalid or has expired. Please request a new one.",
      },
    });
  }

  // Update the user's password
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: record.userId },
    data: { passwordHash },
  });

  // Delete the used reset token
  await prisma.passwordResetToken.delete({ where: { token: tokenHash } });

  // Also invalidate all refresh tokens (force re-login everywhere)
  await prisma.refreshToken.deleteMany({ where: { userId: record.userId } });

  res.status(200).json({
    success: true,
    message: "Password has been reset successfully. Please log in with your new password.",
  });
});

// ─────────────────────────────────────────
//  POST /api/auth/otp/request
// ─────────────────────────────────────────
exports.requestOtp = asyncHandler(async (req, res) => {
  const { phone } = req.body;

  let user = await prisma.user.findUnique({ where: { phone } });

  if (!user) {
    const timestamp = Date.now().toString().slice(-6);
    user = await prisma.user.create({
      data: {
        name: `User_${timestamp}`,
        phone,
        email: null,
        passwordHash: "",
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

  const { generateOtp } = require("../utils/otp");
  const otpCode = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await prisma.otp.deleteMany({ where: { phone } });
  await prisma.otp.create({
    data: { phone, otp: otpCode, expiresAt },
  });

  // TODO: Send OTP via SMS service (Twilio, etc.)
  console.log(`OTP for ${phone}: ${otpCode}`);

  res.status(200).json({
    success: true,
    message: "OTP sent successfully",
    devOtp: process.env.NODE_ENV === "development" ? otpCode : undefined,
  });
});

// ─────────────────────────────────────────
//  POST /api/auth/otp/verify
// ─────────────────────────────────────────
exports.verifyOtp = asyncHandler(async (req, res) => {
  const { phone, otp } = req.body;

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

  const user = await prisma.user.findUnique({ where: { phone } });

  if (!user) {
    return res.status(404).json({
      error: {
        code: "USER_NOT_FOUND",
        message: "User not found",
      },
    });
  }

  await prisma.otp.delete({ where: { id: otpRecord.id } });

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

// ─────────────────────────────────────────
//  DELETE /api/auth/user/:id  (Admin only)
// ─────────────────────────────────────────
exports.deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await prisma.user.findUnique({ where: { id } });

  if (!user) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "User not found" },
    });
  }

  if (user.role === "admin") {
    return res.status(403).json({
      error: { code: "FORBIDDEN", message: "Cannot delete admin accounts" },
    });
  }

  const staffRecord = await prisma.staff.findUnique({ where: { userId: id } });
  if (staffRecord) {
    await prisma.staff.delete({ where: { id: staffRecord.id } });
  }

  await prisma.user.delete({ where: { id } });

  res.status(200).json({
    success: true,
    message: "User has been deleted successfully",
  });
});
