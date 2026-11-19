
const { z } = require("zod");

// ==========================================
// COMMON
// ==========================================

const uuidSchema = z.string().uuid("ID không hợp lệ");

const pagination = {
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
};

const requestIdParamsSchema = z.object({
    requestId: uuidSchema,
}).strict();

// ==========================================
// CUSTOMER
// ==========================================

const createProfileRequestSchema = z.object({
    requestedFullName: z.preprocess(
        (value) =>
            typeof value === "string" && value.trim() === ""
                ? undefined
                : value,
        z.string()
            .trim()
            .min(1, "Họ tên không được để trống")
            .max(150, "Họ tên không được vượt quá 150 ký tự")
            .optional()
    ),

    requestedPhone: z.preprocess(
        (value) =>
            typeof value === "string" && value.trim() === ""
                ? undefined
                : value,
        z.string()
            .trim()
            .max(20, "Số điện thoại không được vượt quá 20 ký tự")
            .optional()
    ),
})
    .strict()
    .refine(
        (value) =>
            value.requestedFullName !== undefined ||
            value.requestedPhone !== undefined,
        {
            message: "Vui lòng cung cấp họ tên hoặc số điện thoại cần thay đổi",
            path: ["requestedFullName"],
        }
    );

const myProfileRequestListQuerySchema = z.object({
    ...pagination,
}).strict();

// ==========================================
// ADMIN
// ==========================================

const adminProfileRequestListQuerySchema = z.object({
    ...pagination,
    customerId: uuidSchema.optional(),
    status: z.enum(["REQUESTED", "APPROVED", "REJECTED"]).optional(),
    search: z.string().trim().max(100).optional(),
}).strict();

const approveProfileRequestSchema = z.object({
    adminNote: z.string().trim().max(2000).nullable().optional(),
}).strict();

const rejectProfileRequestSchema = z.object({
    rejectionReason: z.string()
        .trim()
        .min(3, "Lý do từ chối phải có ít nhất 3 ký tự")
        .max(1000, "Lý do từ chối không được vượt quá 1000 ký tự"),
}).strict();

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
    requestIdParamsSchema,

    createProfileRequestSchema,
    myProfileRequestListQuerySchema,

    adminProfileRequestListQuerySchema,
    approveProfileRequestSchema,
    rejectProfileRequestSchema,
};
