
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
// CREATE ORDER
// ==========================================

const createOrderSchema = z.object({
    paymentMethod: z.enum(["COD", "VNPAY"], {
        errorMap: () => ({
            message: "Phương thức thanh toán không hợp lệ",
        }),
    }),

    voucherCode: z.string()
        .trim()
        .min(1)
        .max(50)
        .optional(),

    shippingRecipientName: z.string()
        .trim()
        .min(2)
        .max(150),

    shippingPhone: z.string()
        .trim()
        .min(8)
        .max(20)
        .regex(/^[0-9+()\-\s]+$/, "Số điện thoại không hợp lệ"),

    shippingProvinceCity: z.string()
        .trim()
        .min(1)
        .max(150),

    shippingDistrict: z.string()
        .trim()
        .min(1)
        .max(150),

    shippingStreet: z.string()
        .trim()
        .min(1)
        .max(255),

    shippingAddressNote: z.string()
        .trim()
        .max(1000)
        .nullable()
        .optional(),

    customerNote: z.string()
        .trim()
        .max(2000)
        .nullable()
        .optional(),
}).strict();

// ==========================================
// CUSTOMER ORDER LIST
// ==========================================

const myOrderListQuerySchema = z.object({
    ...paginationSchema,

    status: z.enum([
        "PENDING_CONFIRMATION",
        "CONFIRMED",
        "PROCESSING",
        "SHIPPING",
        "DELIVERED",
        "COMPLETED",
        "CANCELLED",
    ]).optional(),
}).strict();

// ==========================================
// ORDER PARAMS
// ==========================================

const orderIdParamsSchema = z.object({
    orderId: uuidSchema,
}).strict();

// ==========================================
// CANCEL ORDER
// ==========================================

const cancelOrderSchema = z.object({
    note: z.string()
        .trim()
        .max(1000)
        .nullable()
        .optional(),
}).strict();

// ==========================================
// ADMIN ORDER LIST
// ==========================================

const adminOrderListQuerySchema = z.object({
    ...paginationSchema,

    status: z.enum([
        "PENDING_CONFIRMATION",
        "CONFIRMED",
        "PROCESSING",
        "SHIPPING",
        "DELIVERED",
        "COMPLETED",
        "CANCELLED",
    ]).optional(),

    paymentMethod: z.enum([
        "COD",
        "VNPAY",
    ]).optional(),

    paymentStatus: z.enum([
        "PENDING",
        "PAID",
        "FAILED",
        "CANCELLED",
        "REFUNDED",
        "PARTIALLY_REFUNDED",
    ]).optional(),

    search: z.string()
        .trim()
        .max(100)
        .optional(),

    sortOrder: z.enum([
        "asc",
        "desc",
    ]).default("desc"),
}).strict();

// ==========================================
// ADMIN UPDATE ORDER STATUS
// ==========================================

const updateOrderStatusSchema = z.object({
    status: z.enum([
        "CONFIRMED",
        "PROCESSING",
        "SHIPPING",
        "DELIVERED",
        "COMPLETED",
        "CANCELLED",
    ]),

    note: z.string()
        .trim()
        .max(1000)
        .nullable()
        .optional(),
}).strict();

// ==========================================
// ADMIN MARK COD PAID
// ==========================================

const markOrderPaidSchema = z.object({
    note: z.string()
        .trim()
        .max(1000)
        .nullable()
        .optional(),
}).strict();

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
    createOrderSchema,
    myOrderListQuerySchema,
    orderIdParamsSchema,
    cancelOrderSchema,
    adminOrderListQuerySchema,
    updateOrderStatusSchema,
    markOrderPaidSchema,
};
