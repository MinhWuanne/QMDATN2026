
const profileRequestService = require("./member-profile-request.service");

// ==========================================
// RESPONSE
// ==========================================

function respond(res, statusCode, message, data) {
    return res.status(statusCode).json({
        success: true,
        message,
        data,
    });
}

// ==========================================
// CUSTOMER
// ==========================================

async function createMyProfileRequest(req, res, next) {
    try {
        const data = await profileRequestService.createProfileRequest(
            req.user.id,
            req.body
        );

        return respond(
            res,
            201,
            "MEMBER_PROFILE_REQUEST_CREATED",
            data
        );
    } catch (error) {
        next(error);
    }
}

async function listMyProfileRequests(req, res, next) {
    try {
        const data = await profileRequestService.listMyProfileRequests(
            req.user.id,
            res.locals.validatedQuery
        );

        return respond(
            res,
            200,
            "MEMBER_PROFILE_REQUESTS_RETRIEVED",
            data
        );
    } catch (error) {
        next(error);
    }
}

async function getMyProfileRequest(req, res, next) {
    try {
        const data = await profileRequestService.getMyProfileRequestById(
            req.user.id,
            req.params.requestId
        );

        return respond(
            res,
            200,
            "MEMBER_PROFILE_REQUEST_RETRIEVED",
            data
        );
    } catch (error) {
        next(error);
    }
}

// ==========================================
// ADMIN
// ==========================================

async function listAdminProfileRequests(req, res, next) {
    try {
        const data = await profileRequestService.listProfileRequests(
            res.locals.validatedQuery
        );

        return respond(
            res,
            200,
            "MEMBER_PROFILE_REQUESTS_RETRIEVED",
            data
        );
    } catch (error) {
        next(error);
    }
}

async function getAdminProfileRequest(req, res, next) {
    try {
        const data = await profileRequestService.getProfileRequestById(
            req.params.requestId
        );

        return respond(
            res,
            200,
            "MEMBER_PROFILE_REQUEST_RETRIEVED",
            data
        );
    } catch (error) {
        next(error);
    }
}

async function approveProfileRequest(req, res, next) {
    try {
        const data = await profileRequestService.approveProfileRequest(
            req.params.requestId,
            req.user.id,
            req.body
        );

        return respond(
            res,
            200,
            "MEMBER_PROFILE_REQUEST_APPROVED",
            data
        );
    } catch (error) {
        next(error);
    }
}

async function rejectProfileRequest(req, res, next) {
    try {
        const data = await profileRequestService.rejectProfileRequest(
            req.params.requestId,
            req.user.id,
            req.body
        );

        return respond(
            res,
            200,
            "MEMBER_PROFILE_REQUEST_REJECTED",
            data
        );
    } catch (error) {
        next(error);
    }
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
    createMyProfileRequest,
    listMyProfileRequests,
    getMyProfileRequest,

    listAdminProfileRequests,
    getAdminProfileRequest,
    approveProfileRequest,
    rejectProfileRequest,
};
