const prisma = require("../config/prisma");
const asyncHandler = require("../utils/asyncHandler");

// GET /api/categories
exports.getAll = asyncHandler(async (req, res) => {
  const data = await prisma.category.findMany({
    select: { id: true, label: true, slug: true, sortOrder: true },
    orderBy: { sortOrder: "asc" },
  });
  res.status(200).json({ data });
});

// POST /api/categories  (admin)
exports.create = asyncHandler(async (req, res) => {
  const { label, slug, sortOrder = 0 } = req.body;

  const existing = await prisma.category.findUnique({ where: { slug } });
  if (existing)
    return res.status(409).json({
      error: {
        code: "CONFLICT",
        message: "Category with this slug already exists",
      },
    });

  const data = await prisma.category.create({
    data: { label, slug, sortOrder },
  });
  res.status(201).json({ data });
});

// PUT /api/categories/:id  (admin)
exports.update = asyncHandler(async (req, res) => {
  const { label, slug, sortOrder } = req.body;
  const data = await prisma.category.update({
    where: { id: req.params.id },
    data: { label, slug, sortOrder },
  });
  res.status(200).json({ data });
});

// DELETE /api/categories/:id  (admin)
exports.remove = asyncHandler(async (req, res) => {
  await prisma.category.delete({ where: { id: req.params.id } });
  res.status(200).json({ success: true });
});
