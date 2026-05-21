const prisma = require("../config/prisma");
const asyncHandler = require("../utils/asyncHandler");

const { formatImages, getUploadedFiles } = require("../utils/imageUrl");

// GET /api/banners
exports.getAll = asyncHandler(async (req, res) => {
  const data = await prisma.banner.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, imageUrl: true, linkTarget: true, sortOrder: true },
  });
  res.status(200).json({ data: data.map((b) => formatImages(req, b)) });
});

// POST /api/banners  (admin — form-data)
exports.create = asyncHandler(async (req, res) => {
  const { linkTarget, sortOrder = 0 } = req.body;

  const files = getUploadedFiles(req);
  const imageUrl = files[0] || req.body.imageUrl || null;
  const imageUrls = files.slice(1);
  if (!imageUrl)
    return res.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "imageUrl or image file is required",
      },
    });

  const data = await prisma.banner.create({
    data: { imageUrl, imageUrls, linkTarget, sortOrder: Number(sortOrder) },
  });

  res.status(201).json({ data: formatImages(req, data) });
});

// PUT /api/banners/:id  (admin)
exports.update = asyncHandler(async (req, res) => {
  const { linkTarget, sortOrder, isActive } = req.body;

  const updateData = {
    ...(linkTarget !== undefined && { linkTarget }),
    ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) }),
    ...(isActive !== undefined && {
      isActive: isActive === true || isActive === "true",
    }),
  };

  const files = getUploadedFiles(req);
  if (files.length) {
    updateData.imageUrl = files[0];
    updateData.imageUrls = files.slice(1);
  }
  const data = await prisma.banner.update({
    where: { id: req.params.id },
    data: updateData,
  });

  res.status(200).json({ data: formatImages(req, data) });
});

// DELETE /api/banners/:id  (admin)
exports.remove = asyncHandler(async (req, res) => {
  await prisma.banner.delete({ where: { id: req.params.id } });
  res.status(200).json({ success: true });
});
