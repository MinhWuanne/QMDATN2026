const express = require("express");

const {
    loginAdminController,
} = require("../controllers/auth.controller");

const router = express.Router();

router.post("/login", loginAdminController);

module.exports = router;