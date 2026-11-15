
const express = require("express");

const {
    authenticate,
    authorize,
} = require("../middlewares/auth.middleware");

const validate = require("../middlewares/validate.middleware");

const controller = require("../modules/chat/chat.controller");

const {
    chatMessageBodySchema,
    chatMessageListQuerySchema,
} = require("../modules/chat/chat.validator");

const router = express.Router();

// All Member routes require an authenticated Customer.
router.use(authenticate, authorize("CUSTOMER"));

// ==========================================
// CHAT
// ==========================================

// GET /api/member/chat/messages
router.get(
    "/chat/messages",
    validate(chatMessageListQuerySchema, "query"),
    controller.getMemberMessages
);

// POST /api/member/chat/messages
router.post(
    "/chat/messages",
    validate(chatMessageBodySchema),
    controller.sendMemberMessage
);

module.exports = router;
