const prisma = require("../config/prisma");
const asyncHandler = require("../utils/asyncHandler");
const { formatImages, getUploadedFiles } = require("../utils/imageUrl");

// Handle both raw JSON (array) and form-data (string)
const parseField = (field) => {
  if (!field) return [];
  if (Array.isArray(field)) return field;
  try {
    return JSON.parse(field);
  } catch {
    return [];
  }
};

// GET /api/beans?search=
exports.getAll = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const where = {
    isAvailable: true,
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { origin: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  const [data, total] = await prisma.$transaction([
    prisma.bean.findMany({
      where,
      include: { grindOptions: true, purchasePlans: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: Number(limit),
    }),
    prisma.bean.count({ where }),
  ]);

  res.status(200).json({
    data: data.map((b) => formatImages(req, b)),
    page: Number(page),
    limit: Number(limit),
    total,
  });
});

// GET /api/beans/:id
exports.getOne = asyncHandler(async (req, res) => {
  const bean = await prisma.bean.findUnique({
    where: { id: req.params.id },
    include: { grindOptions: true, purchasePlans: true },
  });

  if (!bean)
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Bean not found" },
    });

  res.status(200).json({ data: formatImages(req, bean) });
});

// POST /api/beans  (admin — supports both JSON and form-data)
exports.create = asyncHandler(async (req, res) => {
  const {
    name,
    origin,
    weight,
    price,
    description,
    isDark,
    grindOptions,
    purchasePlans,
  } = req.body;

  // Image: file upload takes priority, then raw JSON imageUrl
  const files = getUploadedFiles(req);
  const imageUrl = files[0] || req.body.imageUrl || null;
  const imageUrls = files.slice(1);

  const parsedGrinds = parseField(grindOptions);
  const parsedPlans = parseField(purchasePlans);

  const bean = await prisma.bean.create({
    data: {
      name,
      origin,
      weight,
      price: Number(price),
      imageUrl,
      imageUrls,
      description: description || null,
      isDark: isDark === true || isDark === "true",
      grindOptions: { create: parsedGrinds.map((g) => ({ grind: g })) },
      purchasePlans: {
        create: parsedPlans.map((p) => ({
          plan: p.plan,
          discount: p.discount ? Number(p.discount) : null,
          description: p.description || null,
        })),
      },
    },
    include: { grindOptions: true, purchasePlans: true },
  });

  res.status(201).json({ data: formatImages(req, bean) });
});

// PUT /api/beans/:id  (admin)
exports.update = asyncHandler(async (req, res) => {
  const { name, origin, weight, price, description, isDark, isAvailable } =
    req.body;

  const data = {
    ...(name !== undefined && { name }),
    ...(origin !== undefined && { origin }),
    ...(weight !== undefined && { weight }),
    ...(price !== undefined && { price: Number(price) }),
    ...(description !== undefined && { description }),
    ...(isDark !== undefined && {
      isDark: isDark === true || isDark === "true",
    }),
    ...(isAvailable !== undefined && {
      isAvailable: isAvailable === true || isAvailable === "true",
    }),
  };

  const files = getUploadedFiles(req);
  if (files.length) {
    data.imageUrl = files[0];
    data.imageUrls = files.slice(1);
  }
  const bean = await prisma.bean.update({
    where: { id: req.params.id },
    data,
    include: { grindOptions: true, purchasePlans: true },
  });

  res.status(200).json({ data: formatImages(req, bean) });
});

// DELETE /api/beans/:id  (admin)
exports.remove = asyncHandler(async (req, res) => {
  await prisma.bean.delete({ where: { id: req.params.id } });
  res.status(200).json({ success: true });
});


// PATCH /api/beans/:id/availability
exports.toggleAvailability = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isAvailable } = req.body; // true or false

  const bean = await prisma.bean.findUnique({ where: { id } });
  if (!bean) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Bean not found" },
    });
  }

  const updated = await prisma.bean.update({
    where: { id },
    data: { isAvailable: isAvailable === true || isAvailable === "true" },
    include: { grindOptions: true, purchasePlans: true },
  });

  res.status(200).json({ 
    success: true, 
    message: `Bean is now ${updated.isAvailable ? 'available' : 'unavailable'}`,
    data: updated 
  });
});


// GET /api/admin/beans
exports.adminList = asyncHandler(async (req, res) => {
  const { 
    search, 
    roastLevel, 
    isAvailable, 
    page = 1, 
    limit = 20 
  } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const where = {
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { origin: { contains: search, mode: "insensitive" } },
      ],
    }),
    ...(roastLevel && { roastLevel }),
    ...(isAvailable !== undefined && { isAvailable: isAvailable === "true" }),
  };

  const [data, total] = await prisma.$transaction([
    prisma.bean.findMany({
      where,
      include: { 
        grindOptions: true, 
        purchasePlans: true,
        subscriptions: true 
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: Number(limit),
    }),
    prisma.bean.count({ where }),
  ]);

  res.status(200).json({
    data,
    page: Number(page),
    limit: Number(limit),
    total,
    totalPages: Math.ceil(total / Number(limit)),
  });
});


// GET /api/beans/filters
exports.getFilters = asyncHandler(async (req, res) => {
  const [roastLevels, origins, processes] = await prisma.$transaction([
    prisma.bean.findMany({
      where: { isAvailable: true },
      distinct: ["roastLevel"],
      select: { roastLevel: true },
    }),
    prisma.bean.findMany({
      where: { isAvailable: true },
      distinct: ["origin"],
      select: { origin: true },
    }),
    prisma.bean.findMany({
      where: { isAvailable: true },
      distinct: ["process"],
      select: { process: true },
    }),
  ]);

  res.status(200).json({
    roastLevels: roastLevels.map(r => r.roastLevel).filter(Boolean),
    origins: origins.map(o => o.origin).filter(Boolean),
    processes: processes.map(p => p.process).filter(Boolean),
  });
});