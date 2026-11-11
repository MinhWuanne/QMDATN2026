const express = require("express");

const {
    authenticate,
    authorize,
} = require("../../middlewares/auth.middleware");

const validate = require("../../middlewares/validate.middleware");

const controller = require("../../modules/voucher/voucher.controller");

const {
    voucherCreateSchema,
    voucherUpdateSchema,
    voucherStatusUpdateSchema,
    voucherListQuerySchema,
    voucherIdParamsSchema,
} = require("../../modules/voucher/voucher.validator");

const router = express.Router();

// All voucher management routes require an admin.
router.use(authenticate, authorize("ADMIN"));

// ==========================================
// VOUCHERS
// ==========================================

// GET /api/admin/vouchers
router.get(
    "/",
    validate(voucherListQuerySchema, "query"),
    controller.listVouchers
);

// GET /api/admin/vouchers/:id
router.get(
    "/:id",
    validate(voucherIdParamsSchema, "params"),
    controller.getVoucher
);

// POST /api/admin/vouchers
router.post(
    "/",
    validate(voucherCreateSchema),
    controller.createVoucher
);

// PATCH /api/admin/vouchers/:id
router.patch(
    "/:id",
    validate(voucherIdParamsSchema, "params"),
    validate(voucherUpdateSchema),
    controller.updateVoucher
);

// PATCH /api/admin/vouchers/:id/status
router.patch(
    "/:id/status",
    validate(voucherIdParamsSchema, "params"),
    validate(voucherStatusUpdateSchema),
    controller.updateVoucherStatus
);

module.exports = router;