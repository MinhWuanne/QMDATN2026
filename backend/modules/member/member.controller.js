const service = require("./member.service");

// ==========================================
// LIST
// ==========================================

async function listMembers(req, res) {
    const result = await service.listMembers(
        res.locals.validatedQuery || req.query
    );

    return res.status(200).json({
        success: true,
        ...result,
    });
}

// ==========================================
// OVERVIEW STATS
// ==========================================

async function getMemberStats(req, res) {
    const stats = await service.getMemberStats();

    return res.status(200).json({
        success: true,
        data: stats,
    });
}

// ==========================================
// DETAIL
// ==========================================

async function getMember(req, res) {
    const member = await service.getMemberById(req.params.id);

    return res.status(200).json({
        success: true,
        data: member,
    });
}

// ==========================================
// UPDATE STATUS
// ==========================================

async function updateMemberStatus(req, res) {
    const member = await service.updateMemberStatus(
        req.params.id,
        req.body,
        req.user.id
    );

    return res.status(200).json({
        success: true,
        message: "MEMBER_STATUS_UPDATED",
        data: member,
    });
}

module.exports = {
    listMembers,
    getMemberStats,
    getMember,
    updateMemberStatus,
};
