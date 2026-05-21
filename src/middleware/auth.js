const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

const protect = (req, res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer "))
    return res
      .status(401)
      .json({ message: "Not authorized — no token provided" });

  try {
    const token = header.split(" ")[1];
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError")
      return res
        .status(401)
        .json({ message: "Token expired — please login again" });
    return res.status(401).json({ message: "Token is invalid" });
  }
};

// Updated: Allow both admin AND staff users
const adminOnly = (req, res, next) => {
  // Allow admin or staff role
  if (req.user?.role === "admin" || req.user?.role === "staff") {
    return next();
  }
  return res
    .status(403)
    .json({ message: "Access denied — admin or staff only" });
};

// Super admin only - strict check (only admin role)
const superAdminOnly = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res
      .status(403)
      .json({ message: "Access denied — super admin only" });
  }
  next();
};

module.exports = { protect, adminOnly, superAdminOnly };
