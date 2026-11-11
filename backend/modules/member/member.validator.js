const { z } = require("zod");

// ==========================================
// LIST QUERY
// ==========================================

const memberListQuerySchema = z.object({
    page: z.coerce.number()
        .int()
        .min(1)
        .optional(),

    limit: z.coerce.number()
        .int()
        .min(1)
        .max(100)
        .optional(),

    search: z.string()
        .trim()
        .max(200)
        .optional(),

    status: z.enum([
        "PENDING_VERIFICATION",
        "ACTIVE",
        "LOCKED",
    ]).optional(),

    sortBy: z.enum([
        "createdAt",
        "fullName",
        "email",
        "status",
    ]).optional(),

    sortOrder: z.enum([
        "asc",
        "desc",
    ]).optional(),
}).strict();

// ==========================================
// PARAMS
// ==========================================

const memberIdParamsSchema = z.object({
    id: z.string().uuid("Member ID không hợp lệ"),
}).strict();

// ==========================================
// STATUS UPDATE
// ==========================================

const memberStatusUpdateSchema = z.object({
    status: z.enum([
        "ACTIVE",
        "LOCKED",
    ]),

    reason: z.string()
        .trim()
        .min(1, "Vui lòng nhập lý do thay đổi trạng thái")
        .max(500),
}).strict();

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
    memberListQuerySchema,
    memberIdParamsSchema,
    memberStatusUpdateSchema,
};
