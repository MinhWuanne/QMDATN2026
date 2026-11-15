
const express = require("express");

const {
    authenticate,
    authorize,
} = require("../../middlewares/auth.middleware");

const validate = require("../../middlewares/validate.middleware");

const controller = require("../../modules/chat/chat.controller");

const {
    chatMessageBodySchema,
    chatMessageListQuerySchema,
    chatConversationListQuerySchema,
    chatConversationIdParamsSchema,
} = require("../../modules/chat/chat.validator");

const router = express.Router();

// All Chat management routes require an Admin.
router.use(authenticate, authorize("ADMIN"));

// ==========================================
// CONVERSATION LIST
// ==========================================

// GET /api/admin/chat/conversations
router.get(
    "/conversations",
    validate(chatConversationListQuerySchema, "query"),
    controller.listAdminConversations
);

// ==========================================
// CONVERSATION MESSAGES
// ==========================================

// GET /api/admin/chat/conversations/:id/messages
router.get(
    "/conversations/:id/messages",
    validate(chatConversationIdParamsSchema, "params"),
    validate(chatMessageListQuerySchema, "query"),
    controller.getAdminConversationMessages
);

// POST /api/admin/chat/conversations/:id/messages
router.post(
    "/conversations/:id/messages",
    validate(chatConversationIdParamsSchema, "params"),
    validate(chatMessageBodySchema),
    controller.sendAdminMessage
);

// ==========================================
// CLOSE CONVERSATION
// ==========================================

// PATCH /api/admin/chat/conversations/:id/close
router.patch(
    "/conversations/:id/close",
    validate(chatConversationIdParamsSchema, "params"),
    controller.closeConversation
);

module.exports = router;
