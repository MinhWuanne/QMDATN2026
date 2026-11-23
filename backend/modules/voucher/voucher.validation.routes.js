
const express = require("express");

const validate = require("../../middlewares/validate.middleware");

const controller = require("./voucher.validation.controller");

const {
    validateVoucherSchema,
} = require("./voucher.validation.validator");

const router = express.Router();

router.post(
    "/validate",
    validate(validateVoucherSchema),
    controller.validateVoucher
);

module.exports = router;
