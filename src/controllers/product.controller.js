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

// ─────────────────────────────────────────
//  GET /api/products?search=&category=
// ─────────────────────────────────────────
exports.getAll = asyncHandler(async (req, res) => {
  const { search, category, page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const where = {
    isAvailable: true,
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { subtitle: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ],
    }),
    ...(category && { category: { slug: category } }),
  };

  const [products, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      include: {
        category: { select: { id: true, label: true, slug: true } },
        variants: true,
        sizes: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: Number(limit),
    }),
    prisma.product.count({ where }),
  ]);

  res.status(200).json({
    data: products.map((p) => formatImages(req, p)),
    page: Number(page),
    limit: Number(limit),
    total,
  });
});

// ─────────────────────────────────────────
//  GET /api/products/:id
// ─────────────────────────────────────────
exports.getOne = asyncHandler(async (req, res) => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
    include: {
      category: { select: { id: true, label: true, slug: true } },
      variants: true,
      sizes: true,
    },
  });

  if (!product)
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Product not found" },
    });

  res.status(200).json({ data: formatImages(req, product) });
});

// ─────────────────────────────────────────
//  POST /api/products  (admin)
// ─────────────────────────────────────────
exports.create = asyncHandler(async (req, res) => {
  const { name, subtitle, description, price, categoryId, variants, sizes } =
    req.body;

  const files = getUploadedFiles(req);
  const imageUrl = files[0] || null;
  const imageUrls = files.slice(1);
  const parsedVariants = parseField(variants);
  const parsedSizes = parseField(sizes);

  const product = await prisma.product.create({
    data: {
      name,
      subtitle: subtitle || null,
      description: description || null,
      price: Number(price),
      imageUrl,
      imageUrls,
      categoryId: categoryId || null,
      variants: {
        create: parsedVariants.map((v) => ({
          name: v.name,
          price: Number(v.price),
        })),
      },
      sizes: {
        create: parsedSizes.map((s) => ({
          label: s.label,
          price: Number(s.price),
        })),
      },
    },
    include: { variants: true, sizes: true, category: true },
  });

  res.status(201).json({ data: formatImages(req, product) });
});

// ─────────────────────────────────────────
//  PUT /api/products/:id  (admin)
// ─────────────────────────────────────────
exports.update = asyncHandler(async (req, res) => {
  const { name, subtitle, description, price, categoryId, isAvailable } =
    req.body;

  const data = {
    ...(name !== undefined && { name }),
    ...(subtitle !== undefined && { subtitle }),
    ...(description !== undefined && { description }),
    ...(price !== undefined && { price: Number(price) }),
    ...(categoryId !== undefined && { categoryId }),
    ...(isAvailable !== undefined && {
      isAvailable: isAvailable === true || isAvailable === "true",
    }),
  };

  // Only update image if new file uploaded
  const files = getUploadedFiles(req);
  if (files.length) {
    data.imageUrl = files[0];
    data.imageUrls = files.slice(1);
  }

  const product = await prisma.product.update({
    where: { id: req.params.id },
    data,
    include: { variants: true, sizes: true, category: true },
  });

  res.status(200).json({ data: formatImages(req, product) });
});

// ─────────────────────────────────────────
//  DELETE /api/products/:id  (admin)
// ─────────────────────────────────────────
exports.remove = asyncHandler(async (req, res) => {
  await prisma.product.delete({ where: { id: req.params.id } });
  res.status(200).json({ success: true });
});

exports.getTodayMenu = asyncHandler(async (req, res) => {
  const categories = await prisma.category.findMany({
    include: {
      products: {
        where: { isAvailable: true },
        include: { variants: true, sizes: true },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  const filteredCategories = categories.filter(
    (cat) => cat.products.length > 0,
  );

  res.status(200).json({
    success: true,
    categories: filteredCategories,
  });
});

// ─────────────────────────────────────────
//  GET /api/products/menu/categories
//  Get all menu categories with item counts
// ─────────────────────────────────────────
exports.getMenuCategories = asyncHandler(async (req, res) => {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    select: {
      id: true,
      label: true,
      slug: true,
      sortOrder: true,
      _count: {
        select: {
          products: {
            where: { isAvailable: true },
          },
        },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  res.status(200).json({
    success: true,
    categories: categories.map((cat) => ({
      id: cat.id,
      label: cat.label,
      slug: cat.slug,
      itemCount: cat._count.products,
    })),
  });
});

// ─────────────────────────────────────────
//  GET /api/products/menu/items/:id
//  Get single menu item detail
// ─────────────────────────────────────────
exports.getMenuItem = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const item = await prisma.product.findFirst({
    where: {
      id,
      isAvailable: true,
    },
    include: {
      category: { select: { id: true, label: true, slug: true } },
      variants: true,
      sizes: true,
    },
  });

  if (!item) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Menu item not found" },
    });
  }

  res.status(200).json({
    success: true,
    data: {
      id: item.id,
      name: item.name,
      subtitle: item.subtitle,
      description: item.description,
      price: parseFloat(item.price),
      imageUrl: item.imageUrl,
      imageUrls: item.imageUrls,
      prepTimeMinutes: item.prepTimeMinutes,
      modifierGroups: item.modifierGroups,
      variants: item.variants,
      sizes: item.sizes,
      category: item.category,
    },
  });
});

// ─────────────────────────────────────────
//  PATCH /api/products/admin/menu/items/:id/availability
//  Toggle sold-out (admin)
// ─────────────────────────────────────────
exports.toggleItemAvailability = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isAvailable } = req.body;

  const item = await prisma.product.findUnique({ where: { id } });

  if (!item) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Menu item not found" },
    });
  }

  const updated = await prisma.product.update({
    where: { id },
    data: { isAvailable: isAvailable === true || isAvailable === "true" },
  });

  res.status(200).json({
    success: true,
    message: `Item is now ${updated.isAvailable ? "available" : "sold out"}`,
    data: {
      id: updated.id,
      name: updated.name,
      isAvailable: updated.isAvailable,
    },
  });
});

// ─────────────────────────────────────────
//  PATCH /api/products/admin/menu/items/:id/special
//  Set as daily special (admin)
// ─────────────────────────────────────────
exports.setDailySpecial = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isDailySpecial, specialOrder } = req.body;

  const item = await prisma.product.findUnique({ where: { id } });

  if (!item) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Menu item not found" },
    });
  }

  const updated = await prisma.product.update({
    where: { id },
    data: {
      isDailySpecial: isDailySpecial === true || isDailySpecial === "true",
      specialOrder: specialOrder !== undefined ? Number(specialOrder) : null,
    },
  });

  res.status(200).json({
    success: true,
    message: updated.isDailySpecial
      ? "Item added to daily specials"
      : "Item removed from daily specials",
    data: {
      id: updated.id,
      name: updated.name,
      isDailySpecial: updated.isDailySpecial,
      specialOrder: updated.specialOrder,
    },
  });
});
