const express = require("express");

const {
  register,
  verifyEmail,
  loginCustomerController,
  refresh,
  logout,
  forgotPassword,
  resetPasswordController,
} = require("../controllers/auth.controller");

const csrfProtection = require("../middlewares/csrf.middleware");

const router = express.Router();

const validate = require("../middlewares/validate.middleware");

const {
  forgotPasswordSchema,
  resetPasswordSchema,
} = require("../validators/auth.validator");

router.post("/register", register);
router.post("/login", loginCustomerController);

router.post("/refresh", csrfProtection, refresh);
router.post("/logout", csrfProtection, logout);

router.post("/verify-email", verifyEmail);

router.post(
  "/forgot-password",
  validate(forgotPasswordSchema),
  forgotPassword
);

router.post(
  "/reset-password",
  validate(resetPasswordSchema),
  resetPasswordController
);

module.exports = router;