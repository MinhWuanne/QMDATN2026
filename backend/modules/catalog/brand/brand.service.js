
const prisma = require("../../../core/database/prisma");
const {
  toSlug,
  assertUuid,
  parseListQuery,
  handleUniqueError,
} = require("../shared/catalog.utils");

async function listBrands(query = {}) {
  const { page, limit, skip, search, isActive } = parseListQuery(query);

  const where = {
    ...(isActive !== undefined ? { isActive } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { slug: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.brand.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { products: true } } },
    }),
    prisma.brand.count({ where }),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function getBrandById(id) {
  assertUuid(id);

  const brand = await prisma.brand.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });

  if (!brand) throw new Error("BRAND_NOT_FOUND");
  return brand;
}

async function createBrand(input) {
  const slug = toSlug(input.slug || input.name);

  if (!slug) {
    const error = new Error("VALIDATION_ERROR");
    error.details = [{ field: "slug", message: "Slug không hợp lệ" }];
    throw error;
  }

  try {
    return await prisma.brand.create({
      data: {
        name: input.name,
        slug,
        description: input.description ?? null,
        logoUrl: input.logoUrl ?? null,
        isActive: input.isActive ?? true,
      },
    });
  } catch (error) {
    handleUniqueError(error, "BRAND");
  }
}

async function updateBrand(id, input) {
  assertUuid(id);

  const existing = await prisma.brand.findUnique({ where: { id } });
  if (!existing) throw new Error("BRAND_NOT_FOUND");

  const data = { ...input };

  if (input.name !== undefined || input.slug !== undefined) {
    data.slug = toSlug(input.slug ?? input.name);

    if (!data.slug) {
      const error = new Error("VALIDATION_ERROR");
      error.details = [{ field: "slug", message: "Slug không hợp lệ" }];
      throw error;
    }
  }

  try {
    return await prisma.brand.update({ where: { id }, data });
  } catch (error) {
    handleUniqueError(error, "BRAND");
  }
}

async function deleteBrand(id) {
  assertUuid(id);

  const existing = await prisma.brand.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });

  if (!existing) throw new Error("BRAND_NOT_FOUND");

  if (existing._count.products > 0) {
    const brand = await prisma.brand.update({
      where: { id },
      data: { isActive: false },
    });

    return { deleted: false, deactivated: true, data: brand };
  }

  try {
    await prisma.brand.delete({ where: { id } });
    return { deleted: true, deactivated: false };
  } catch (error) {
    handleUniqueError(error, "BRAND");
  }
}

module.exports = {
  listBrands,
  getBrandById,
  createBrand,
  updateBrand,
  deleteBrand,
};
