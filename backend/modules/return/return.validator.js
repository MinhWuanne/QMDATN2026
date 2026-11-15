const { z } = require("zod");

const uuidSchema = z.string().uuid("ID không hợp lệ");
const pagination = {
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
};

const returnIdParamsSchema = z.object({
    returnRequestId: uuidSchema,
}).strict();

const createReturnRequestSchema = z.object({
    orderId: uuidSchema,
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

const myReturnListQuerySchema = z.object(pagination).strict();

const adminReturnListQuerySchema = z.object({
    ...pagination,
    status: z.enum([
        "REQUESTED",
        "APPROVED",
        "REJECTED",
        "RECEIVED",
        "INSPECTING",
        "REFUND_PENDING",
        "WAITING_FOR_STOCK",
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

const receiveReturnSchema = z.object({
    conditionNote: z.string().trim().max(1000).nullable().optional(),
}).strict();

const manualRefundSchema = z.object({
    refundReference: z.string().trim().min(1).max(160),
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
    manualRefundSchema,
};