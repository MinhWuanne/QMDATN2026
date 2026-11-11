const express = require("express");

const {
    authenticate,
    authorize,
} = require("../../middlewares/auth.middleware");

const validate = require("../../middlewares/validate.middleware");

const controller = require("../../modules/member/member.controller");

const {
    memberListQuerySchema,
    memberIdParamsSchema,
    memberStatusUpdateSchema,
} = require("../../modules/member/member.validator");

const router = express.Router();

// All member management routes require an admin.
router.use(authenticate, authorize("ADMIN"));

// ==========================================
// MEMBERS
// ==========================================

// GET /api/admin/members
router.get(
    "/",
    validate(memberListQuerySchema, "query"),
    controller.listMembers
);

// GET /api/admin/members/stats
// Must be declared before /:id.
router.get(
    "/stats",
    controller.getMemberStats
);

// GET /api/admin/members/:id
router.get(
    "/:id",
    validate(memberIdParamsSchema, "params"),
    controller.getMember
);

// PATCH /api/admin/members/:id/status
router.patch(
    "/:id/status",
    validate(memberIdParamsSchema, "params"),
    validate(memberStatusUpdateSchema),
    controller.updateMemberStatus
);

module.exports = router;
