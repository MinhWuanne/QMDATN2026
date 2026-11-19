
const express = require("express");

const {
    authenticate,
    authorize,
} = require("../../middlewares/auth.middleware");

const validate = require("../../middlewares/validate.middleware");

const controller = require("./member-profile-request.controller");
const validator = require("./member-profile-request.validator");

// ==========================================
// CUSTOMER ROUTER
// ==========================================

const customerRouter = express.Router();

customerRouter.use(
    authenticate,
    authorize("CUSTOMER")
);

// Create profile update request
customerRouter.post(
    "/",
    validate(validator.createProfileRequestSchema),
    controller.createMyProfileRequest
);

// List own profile update requests
customerRouter.get(
    "/",
    validate(validator.myProfileRequestListQuerySchema, "query"),
    controller.listMyProfileRequests
);

// Get own profile update request
customerRouter.get(
    "/:requestId",
    validate(validator.requestIdParamsSchema, "params"),
    controller.getMyProfileRequest
);

// ==========================================
// ADMIN ROUTER
// ==========================================

const adminRouter = express.Router();

adminRouter.use(
    authenticate,
    authorize("ADMIN")
);

// List all profile update requests
adminRouter.get(
    "/",
    validate(validator.adminProfileRequestListQuerySchema, "query"),
    controller.listAdminProfileRequests
);

// Get profile update request detail
adminRouter.get(
    "/:requestId",
    validate(validator.requestIdParamsSchema, "params"),
    controller.getAdminProfileRequest
);

// Approve profile update request
adminRouter.post(
    "/:requestId/approve",
    validate(validator.requestIdParamsSchema, "params"),
    validate(validator.approveProfileRequestSchema),
    controller.approveProfileRequest
);

// Reject profile update request
adminRouter.post(
    "/:requestId/reject",
    validate(validator.requestIdParamsSchema, "params"),
    validate(validator.rejectProfileRequestSchema),
    controller.rejectProfileRequest
);

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
    customerProfileRequestRouter: customerRouter,
    adminProfileRequestRouter: adminRouter,
};
