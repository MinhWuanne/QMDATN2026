
const service = require("./chat.service");

// ==========================================
// MEMBER: GET MESSAGES
// ==========================================

async function getMemberMessages(req, res) {
    const result = await service.getMemberMessages(
        req.user.id,
        res.locals.validatedQuery || {}
    );

    return res.status(200).json({
        success: true,
        data: result,
    });
}

// ==========================================
// MEMBER: SEND MESSAGE
// ==========================================

async function sendMemberMessage(req, res) {
    const result = await service.sendMemberMessage(
        req.user.id,
        req.body
    );

    return res.status(201).json({
        success: true,
        message: "CHAT_MESSAGE_SENT",
        data: result,
    });
}

// ==========================================
// ADMIN: LIST CONVERSATIONS
// ==========================================

async function listAdminConversations(req, res) {
    const result = await service.listAdminConversations(
        req.user.id,
        res.locals.validatedQuery || {}
    );

    return res.status(200).json({
        success: true,
        ...result,
    });
}

// ==========================================
// ADMIN: GET CONVERSATION MESSAGES
// ==========================================

async function getAdminConversationMessages(req, res) {
    const result = await service.getAdminConversationMessages(
        req.params.id,
        req.user.id,
        res.locals.validatedQuery || {}
    );

    return res.status(200).json({
        success: true,
        data: result,
    });
}

// ==========================================
// ADMIN: SEND MESSAGE
// ==========================================

async function sendAdminMessage(req, res) {
    const result = await service.sendAdminMessage(
        req.params.id,
        req.user.id,
        req.body
    );

    return res.status(201).json({
        success: true,
        message: "CHAT_MESSAGE_SENT",
        data: result,
    });
}

// ==========================================
// ADMIN: CLOSE CONVERSATION
// ==========================================

async function closeConversation(req, res) {
    const result = await service.closeConversation(
        req.params.id
    );

    return res.status(200).json({
        success: true,
        message: "CHAT_CONVERSATION_CLOSED",
        data: result,
    });
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
    getMemberMessages,
    sendMemberMessage,

    listAdminConversations,
    getAdminConversationMessages,
    sendAdminMessage,
    closeConversation,
};
