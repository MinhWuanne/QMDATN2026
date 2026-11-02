const prisma = require("../../../core/database/prisma");
const {
  toSlug,
  assertUuid,
  parseListQuery,
  handleUniqueError,
} = require("../shared/catalog.utils");

async function listCategories(query = {}) {
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
    prisma.category.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      include: {
        _count: { select: { products: true } },
      },
    }),
    prisma.category.count({ where }),
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

async function getCategoryById(id) {
  assertUuid(id);

  const category = await prisma.category.findUnique({
    where: { id },
    include: {
      _count: { select: { products: true } },
    },
  });

  if (!category) throw new Error("CATEGORY_NOT_FOUND");

  return category;
}

async function createCategory(input) {
  const slug = input.slug ? toSlug(input.slug) : toSlug(input.name);

  if (!slug) {
    const error = new Error("VALIDATION_ERROR");
    error.details = [{ field: "slug", message: "Slug không hợp lệ" }];
    throw error;
  }

  try {
    return await prisma.category.create({
      data: {
        name: input.name,
        slug,
        description: input.description ?? null,
        imageUrl: input.imageUrl ?? null,
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
      },
    });
  } catch (error) {
    handleUniqueError(error, "CATEGORY");
  }
}

async function updateCategory(id, input) {
  assertUuid(id);

  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw new Error("CATEGORY_NOT_FOUND");

  const data = { ...input };

  if (input.name !== undefined || input.slug !== undefined) {
    const source = input.slug ?? input.name ?? existing.slug;
    data.slug = toSlug(source);

    if (!data.slug) {
      const error = new Error("VALIDATION_ERROR");
      error.details = [{ field: "slug", message: "Slug không hợp lệ" }];
      throw error;
    }
  }

  try {
    return await prisma.category.update({
      where: { id },
      data,
    });
  } catch (error) {
    handleUniqueError(error, "CATEGORY");
  }
}

module.exports = {
  listCategories,
  getCategoryById,
  createCategory,
  updateCategory,
};
