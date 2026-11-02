const express = require("express");

const {
    loginAdminController,
    refreshAdmin,
    logoutAdmin,
} = require("../modules/auth/admin/admin-auth.controller");

const csrfProtection = require("../middlewares/csrf.middleware");

const router = express.Router();

router.post("/login", loginAdminController);
router.post("/refresh", csrfProtection, refreshAdmin);
router.post("/logout", csrfProtection, logoutAdmin);

module.exports = router;
