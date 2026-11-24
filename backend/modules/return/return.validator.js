
const { z } = require("zod");

const uuidSchema = z.string().uuid("ID không hợp lệ");

const pagination = {
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
};

const returnIdParamsSchema = z.object({
    returnRequestId: uuidSchema,
}).strict();

const createReturnItemSchema = z.object({
    orderItemId: uuidSchema,
    quantity: z.number().int().min(1),
    resolution: z.enum(["REFUND", "EXCHANGE"]),
    reason: z.string().trim().min(3).max(500),
    customerNote: z.string().trim().max(2000).nullable().optional(),
    exchangeVariantId: uuidSchema.optional(),
}).strict().superRefine((value, ctx) => {
    if (value.resolution === "EXCHANGE" && !value.exchangeVariantId) {
        ctx.addIssue({
            code: "custom",
            path: ["exchangeVariantId"],
            message: "Vui lòng chọn phiên bản muốn đổi",
        });
    }

    if (value.resolution === "REFUND" && value.exchangeVariantId) {
        ctx.addIssue({
            code: "custom",
            path: ["exchangeVariantId"],
            message: "Yêu cầu hoàn tiền không nhận phiên bản đổi",
        });
    }
});

const createReturnRequestSchema = z.object({
    orderId: uuidSchema,

    items: z.array(createReturnItemSchema)
        .min(1, "Vui lòng chọn ít nhất một sản phẩm")
        .max(100, "Số sản phẩm yêu cầu vượt quá giới hạn"),
}).strict().superRefine((value, ctx) => {
    const seenOrderItemIds = new Set();

    value.items.forEach((item, index) => {
        if (seenOrderItemIds.has(item.orderItemId)) {
            ctx.addIssue({
                code: "custom",
                path: ["items", index, "orderItemId"],
                message: "Không được chọn trùng sản phẩm trong cùng yêu cầu",
            });
        }

        seenOrderItemIds.add(item.orderItemId);
    });
});

const myReturnListQuerySchema = z.object(pagination).strict();

const adminReturnListQuerySchema = z.object({
    ...pagination,

    customerId: uuidSchema.optional(),

    status: z.enum([
        "REQUESTED",
        "APPROVED",
        "REJECTED",
        "RECEIVED",
        "INSPECTING",
        "REFUND_PENDING",
        "WAITING_FOR_STOCK",
        "REPLACEMENT_PENDING",
        "COMPLETED",
        "CANCELLED",
    ]).optional(),

    resolution: z.enum(["REFUND", "EXCHANGE"]).optional(),

    search: z.string().trim().max(100).optional(),
}).strict();

const adminNoteSchema = z.object({
    adminNote: z.string().trim().max(2000).nullable().optional(),
}).strict();

const rejectReturnSchema = z.object({
    rejectionReason: z.string().trim().min(3).max(1000),
}).strict();

const receiveReturnSchema = z.object({}).strict();

const acceptReturnSchema = z.object({
    conditionNote: z.string().trim().max(1000).nullable().optional(),
}).strict();

const manualRefundSchema = z.object({
    refundReference: z.string().trim().min(1).max(120),
    adminNote: z.string().trim().max(2000).nullable().optional(),
}).strict();

module.exports = {
    returnIdParamsSchema,
    createReturnRequestSchema,
    myReturnListQuerySchema,
    adminReturnListQuerySchema,
    adminNoteSchema,
    rejectReturnSchema,
    receiveReturnSchema,
    acceptReturnSchema,
    manualRefundSchema,
};
