const express = require("express");

const {
    register,
    verifyEmail,
    resendRegistrationOtpController,
    loginCustomerController,
    refresh,
    logout,
    forgotPassword,
    resetPasswordController,
} = require("../modules/auth/customer/customer-auth.controller");

const csrfProtection = require("../middlewares/csrf.middleware");
const validate = require("../middlewares/validate.middleware");

const {
    forgotPasswordSchema,
    resetPasswordSchema,
} = require("../modules/auth/customer/password-reset.validator");

const router = express.Router();

const {
    verifyEmailSchema,
    resendRegistrationOtpSchema,
} = require("../modules/auth/customer/customer-auth.validator");

router.post("/register", register);
router.post("/login", loginCustomerController);
router.post("/refresh", csrfProtection, refresh);
router.post("/logout", csrfProtection, logout);
router.post(
    "/verify-email",
    validate(verifyEmailSchema),
    verifyEmail
);
router.post(
    "/resend-verification",
    validate(resendRegistrationOtpSchema),
    resendRegistrationOtpController
);
router.post("/forgot-password", validate(forgotPasswordSchema), forgotPassword);
router.post("/reset-password", validate(resetPasswordSchema), resetPasswordController);


module.exports = router;
