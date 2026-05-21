const prisma = require("../config/prisma");
const asyncHandler = require("../utils/asyncHandler");

// ─────────────────────────────────────────
//  GET /api/user/addresses
// ─────────────────────────────────────────
exports.getAddresses = asyncHandler(async (req, res) => {
  const addresses = await prisma.address.findMany({
    where: { userId: req.user.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });

  res.status(200).json({ addresses });
});

// ─────────────────────────────────────────
//  POST /api/user/addresses
// ─────────────────────────────────────────
exports.addAddress = asyncHandler(async (req, res) => {
  const { label, street, city, postalCode, isDefault } = req.body;

  // If setting as default, update all other addresses
  if (isDefault) {
    await prisma.address.updateMany({
      where: { userId: req.user.id },
      data: { isDefault: false },
    });
  }

  const address = await prisma.address.create({
    data: {
      label,
      street,
      city,
      postalCode,
      isDefault: isDefault || false,
      userId: req.user.id,
    },
  });

  res.status(201).json({ address });
});

// ─────────────────────────────────────────
//  PATCH /api/user/addresses/:id
// ─────────────────────────────────────────
exports.updateAddress = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { label, street, city, postalCode, isDefault } = req.body;

  // Check if address exists and belongs to user
  const existingAddress = await prisma.address.findFirst({
    where: {
      id: id,
      userId: req.user.id,
    },
  });

  if (!existingAddress) {
    return res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Address not found",
      },
    });
  }

  // If setting as default, update all other addresses
  if (isDefault === true) {
    await prisma.address.updateMany({
      where: { userId: req.user.id },
      data: { isDefault: false },
    });
  }

  const address = await prisma.address.update({
    where: { id: id },
    data: {
      ...(label !== undefined && { label }),
      ...(street !== undefined && { street }),
      ...(city !== undefined && { city }),
      ...(postalCode !== undefined && { postalCode }),
      ...(isDefault !== undefined && { isDefault }),
    },
  });

  res.status(200).json({ address });
});

// ─────────────────────────────────────────
//  DELETE /api/user/addresses/:id
// ─────────────────────────────────────────
exports.deleteAddress = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Check if address exists and belongs to user
  const address = await prisma.address.findFirst({
    where: {
      id: id,
      userId: req.user.id,
    },
  });

  if (!address) {
    return res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Address not found",
      },
    });
  }

  await prisma.address.delete({
    where: { id: id },
  });

  res.status(200).json({ success: true });
});
