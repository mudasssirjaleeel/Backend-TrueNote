const { hasPermission } = require("../utils/permissions");

// Middleware to require permission
const requirePermission = (permission) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Not authenticated" },
      });
    }

    const hasPerm = await hasPermission(req.user.id, permission);

    if (hasPerm) {
      return next();
    }

    res.status(403).json({
      error: {
        code: "FORBIDDEN",
        message: `Permission denied: ${permission} required`,
      },
    });
  };
};

module.exports = {
  requirePermission,
};
