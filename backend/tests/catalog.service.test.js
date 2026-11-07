
const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

// Fake Prisma client: không kết nối database thật.
const fakePrisma = {
  category: {
    create: async () => {},
    findUnique: async () => null,
    update: async () => {},
    delete: async () => {},
    findMany: async () => [],
    count: async () => 0,
  },
  brand: {
    create: async () => {},
    findUnique: async () => null,
    update: async () => {},
    delete: async () => {},
    findMany: async () => [],
    count: async () => 0,
  },
  $transaction: async (operations) => Promise.all(operations),
};

// Đăng ký fake Prisma trước khi import các service.
const prismaPath = require.resolve("../core/database/prisma");
const prismaModule = new Module(prismaPath);

prismaModule.filename = prismaPath;
prismaModule.loaded = true;
prismaModule.exports = fakePrisma;

require.cache[prismaPath] = prismaModule;

const prisma = fakePrisma;
const VALID_ID = "550e8400-e29b-41d4-a716-446655440000";

const categoryService = require("../modules/catalog/category/category.service");
const brandService = require("../modules/catalog/brand/brand.service");

const {
  toSlug,
  assertUuid,
  parseListQuery,
  handleUniqueError,
} = require("../modules/catalog/shared/catalog.utils");

const originalMethods = {};

function mockMethod(target, method, implementation) {
  const key = `${target === prisma.category ? "category" : "brand"}.${method}`;

  if (!Object.hasOwn(originalMethods, key)) {
    const delegate = target === prisma.category ? "category" : "brand";
    originalMethods[key] = target[method];
  }

  target[method] = implementation;
}

function restoreMocks() {
  for (const [key, implementation] of Object.entries(originalMethods)) {
    const [delegate, method] = key.split(".");
    prisma[delegate][method] = implementation;
  }

  for (const key of Object.keys(originalMethods)) {
    delete originalMethods[key];
  }
}


// ======================================================
// CATALOG UTILS
// ======================================================

test("Catalog utils: convert Vietnamese name to slug", () => {
  assert.equal(toSlug("Vợt Cầu Lông Cao Cấp"), "vot-cau-long-cao-cap");
  assert.equal(toSlug("Đồ Thể Thao"), "do-the-thao");
  assert.equal(toSlug("  Yonex   Pro  "), "yonex-pro");
});

test("Catalog utils: reject invalid UUID", () => {
  assert.throws(
    () => assertUuid("invalid-id"),
    (error) => error.message === "VALIDATION_ERROR"
  );
});

test("Catalog utils: parse list query correctly", () => {
  const result = parseListQuery({
    page: "3",
    limit: "10",
    search: "  Yonex  ",
    isActive: "false",
  });

  assert.deepEqual(result, {
    page: 3,
    limit: 10,
    skip: 20,
    search: "Yonex",
    isActive: false,
  });
});

test("Catalog utils: limit page size to 100", () => {
  const result = parseListQuery({ page: "-1", limit: "500" });

  assert.equal(result.page, 1);
  assert.equal(result.limit, 100);
  assert.equal(result.skip, 0);
});

test("Catalog utils: map duplicate slug error", () => {
  assert.throws(
    () => handleUniqueError(
      {
        code: "P2002",
        meta: { target: ["slug"] },
      },
      "CATEGORY"
    ),
    (error) => error.message === "CATEGORY_SLUG_EXISTS"
  );
});

// ======================================================
// CATEGORY SERVICE
// ======================================================

test("Category: create with generated slug and default values", async () => {
  const expected = {
    id: VALID_ID,
    name: "Vợt Cầu Lông",
    slug: "vot-cau-long",
  };

  mockMethod(prisma.category, "create", async ({ data }) => {
    assert.equal(data.slug, "vot-cau-long");
    assert.equal(data.isActive, true);
    assert.equal(data.sortOrder, 0);

    return expected;
  });

  try {
    const result = await categoryService.createCategory({
      name: "Vợt Cầu Lông",
    });

    assert.deepEqual(result, expected);
  } finally {
    restoreMocks();
  }
});

test("Category: reject duplicate slug", async () => {
  mockMethod(prisma.category, "create", async () => {
    const error = new Error("Unique constraint failed");
    error.code = "P2002";
    error.meta = { target: ["slug"] };
    throw error;
  });

  try {
    await assert.rejects(
      categoryService.createCategory({
        name: "Yonex",
        slug: "yonex",
      }),
      { message: "CATEGORY_SLUG_EXISTS" }
    );
  } finally {
    restoreMocks();
  }
});

test("Category: update name and regenerate slug", async () => {
  mockMethod(prisma.category, "findUnique", async () => ({
    id: VALID_ID,
    name: "Old name",
  }));

  mockMethod(prisma.category, "update", async ({ data }) => {
    assert.equal(data.name, "Vợt Pickleball");
    assert.equal(data.slug, "vot-pickleball");

    return { id: VALID_ID, ...data };
  });

  try {
    const result = await categoryService.updateCategory(VALID_ID, {
      name: "Vợt Pickleball",
    });

    assert.equal(result.slug, "vot-pickleball");
  } finally {
    restoreMocks();
  }
});

test("Category: reject update when category does not exist", async () => {
  mockMethod(prisma.category, "findUnique", async () => null);

  try {
    await assert.rejects(
      categoryService.updateCategory(VALID_ID, {
        name: "New name",
      }),
      { message: "CATEGORY_NOT_FOUND" }
    );
  } finally {
    restoreMocks();
  }
});

test("Category: permanently delete when no products use it", async () => {
  mockMethod(prisma.category, "findUnique", async () => ({
    id: VALID_ID,
    _count: { products: 0 },
  }));

  mockMethod(prisma.category, "delete", async () => ({
    id: VALID_ID,
  }));

  try {
    const result = await categoryService.deleteCategory(VALID_ID);

    assert.deepEqual(result, {
      deleted: true,
      deactivated: false,
    });
  } finally {
    restoreMocks();
  }
});

test("Category: deactivate instead of deleting when products use it", async () => {
  mockMethod(prisma.category, "findUnique", async () => ({
    id: VALID_ID,
    _count: { products: 2 },
  }));

  mockMethod(prisma.category, "update", async ({ data }) => ({
    id: VALID_ID,
    ...data,
  }));

  try {
    const result = await categoryService.deleteCategory(VALID_ID);

    assert.equal(result.deleted, false);
    assert.equal(result.deactivated, true);
    assert.equal(result.data.isActive, false);
  } finally {
    restoreMocks();
  }
});

// ======================================================
// BRAND SERVICE
// ======================================================

test("Brand: create with generated slug and default values", async () => {
  const expected = {
    id: VALID_ID,
    name: "Thương hiệu Yonex",
    slug: "thuong-hieu-yonex",
  };

  mockMethod(prisma.brand, "create", async ({ data }) => {
    assert.equal(data.slug, "thuong-hieu-yonex");
    assert.equal(data.isActive, true);
    assert.equal(data.logoUrl, null);

    return expected;
  });

  try {
    const result = await brandService.createBrand({
      name: "Thương hiệu Yonex",
    });

    assert.deepEqual(result, expected);
  } finally {
    restoreMocks();
  }
});

test("Brand: reject duplicate slug", async () => {
  mockMethod(prisma.brand, "create", async () => {
    const error = new Error("Unique constraint failed");
    error.code = "P2002";
    error.meta = { target: ["slug"] };
    throw error;
  });

  try {
    await assert.rejects(
      brandService.createBrand({
        name: "Yonex",
        slug: "yonex",
      }),
      { message: "BRAND_SLUG_EXISTS" }
    );
  } finally {
    restoreMocks();
  }
});

test("Brand: update name and regenerate slug", async () => {
  mockMethod(prisma.brand, "findUnique", async () => ({
    id: VALID_ID,
    name: "Old brand",
  }));

  mockMethod(prisma.brand, "update", async ({ data }) => ({
    id: VALID_ID,
    ...data,
  }));

  try {
    const result = await brandService.updateBrand(VALID_ID, {
      name: "Victor Sport",
    });

    assert.equal(result.slug, "victor-sport");
  } finally {
    restoreMocks();
  }
});

test("Brand: reject update when brand does not exist", async () => {
  mockMethod(prisma.brand, "findUnique", async () => null);

  try {
    await assert.rejects(
      brandService.updateBrand(VALID_ID, {
        name: "New brand",
      }),
      { message: "BRAND_NOT_FOUND" }
    );
  } finally {
    restoreMocks();
  }
});

test("Brand: permanently delete when no products use it", async () => {
  mockMethod(prisma.brand, "findUnique", async () => ({
    id: VALID_ID,
    _count: { products: 0 },
  }));

  mockMethod(prisma.brand, "delete", async () => ({
    id: VALID_ID,
  }));

  try {
    const result = await brandService.deleteBrand(VALID_ID);

    assert.deepEqual(result, {
      deleted: true,
      deactivated: false,
    });
  } finally {
    restoreMocks();
  }
});

test("Brand: deactivate instead of deleting when products use it", async () => {
  mockMethod(prisma.brand, "findUnique", async () => ({
    id: VALID_ID,
    _count: { products: 3 },
  }));

  mockMethod(prisma.brand, "update", async ({ data }) => ({
    id: VALID_ID,
    ...data,
  }));

  try {
    const result = await brandService.deleteBrand(VALID_ID);

    assert.equal(result.deleted, false);
    assert.equal(result.deactivated, true);
    assert.equal(result.data.isActive, false);
  } finally {
    restoreMocks();
  }
});