
const { z } = require("zod");

// ==========================================
// COMMON
// ==========================================

const uuidSchema = z.string().uuid("ID không hợp lệ");

const paginationSchema = {
    page: z.coerce.number()
        .int()
        .min(1)
        .default(1),

    limit: z.coerce.number()
        .int()
        .min(1)
        .max(100)
        .default(20),
};

// ==========================================
// INVENTORY LIST QUERY
// ==========================================

const inventoryListQuerySchema = z.object({
    ...paginationSchema,

    search: z.string()
        .trim()
        .max(200)
        .optional(),

    stockStatus: z.enum([
        "IN_STOCK",
        "LOW_STOCK",
        "OUT_OF_STOCK",
    ]).optional(),

    categoryId: uuidSchema.optional(),

    brandId: uuidSchema.optional(),

    sortBy: z.enum([
        "updatedAt",
        "quantityOnHand",
        "reservedQuantity",
        "availableQuantity",
        "sku",
        "productName",
    ]).default("updatedAt"),

    sortOrder: z.enum([
        "asc",
        "desc",
    ]).default("desc"),
}).strict();

// ==========================================
// INVENTORY DETAIL PARAMS
// ==========================================

const inventoryVariantParamsSchema = z.object({
    variantId: uuidSchema,
}).strict();

// ==========================================
// INVENTORY MOVEMENT QUERY
// ==========================================

const inventoryMovementQuerySchema = z.object({
    ...paginationSchema,

    type: z.enum([
        "PURCHASE",
        "SALE",
        "ORDER_CANCEL",
        "CUSTOMER_RETURN",
        "ADJUSTMENT",
    ]).optional(),

    sortOrder: z.enum([
        "asc",
        "desc",
    ]).default("desc"),
}).strict();

// ==========================================
// PURCHASE
// ==========================================

const inventoryPurchaseSchema = z.object({
    variantId: uuidSchema,

    quantity: z.number()
        .int()
        .positive("Số lượng nhập phải lớn hơn 0")
        .max(1000000),

    note: z.string()
        .trim()
        .max(1000)
        .nullable()
        .optional(),
}).strict();

// ==========================================
// ADJUSTMENT
// ==========================================

const inventoryAdjustmentSchema = z.object({
    variantId: uuidSchema,

    actualStock: z.number()
        .int()
        .min(0, "Số tồn thực tế không được âm")
        .max(1000000),

    note: z.string()
        .trim()
        .min(1, "Vui lòng nhập lý do điều chỉnh")
        .max(1000),
}).strict();

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
    inventoryListQuerySchema,
    inventoryVariantParamsSchema,
    inventoryMovementQuerySchema,
    inventoryPurchaseSchema,
    inventoryAdjustmentSchema,
};
