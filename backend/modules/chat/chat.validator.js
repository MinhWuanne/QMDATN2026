
const { z } = require("zod");

// ==========================================
// MESSAGE BODY
// ==========================================

const chatMessageBodySchema = z.object({
    content: z.string()
        .trim()
        .min(1, "Tin nhắn không được để trống")
        .max(2000, "Tin nhắn không được vượt quá 2000 ký tự"),
}).strict();

// ==========================================
// MESSAGE LIST QUERY
// ==========================================

const chatMessageListQuerySchema = z.object({
    limit: z.coerce.number()
        .int()
        .min(1)
        .max(100)
        .optional(),

    cursor: z.string()
        .uuid("Message cursor không hợp lệ")
        .optional(),
}).strict();

// ==========================================
// ADMIN CONVERSATION LIST QUERY
// ==========================================

const chatConversationListQuerySchema = z.object({
    page: z.coerce.number()
        .int()
        .min(1)
        .optional(),

    limit: z.coerce.number()
        .int()
        .min(1)
        .max(100)
        .optional(),

    status: z.enum([
        "OPEN",
        "CLOSED",
    ]).optional(),

    search: z.string()
        .trim()
        .max(200)
        .optional(),
}).strict();

// ==========================================
// CONVERSATION PARAMS
// ==========================================

const chatConversationIdParamsSchema = z.object({
    id: z.string().uuid("Conversation ID không hợp lệ"),
}).strict();

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
    chatMessageBodySchema,
    chatMessageListQuerySchema,
    chatConversationListQuerySchema,
    chatConversationIdParamsSchema,
};
