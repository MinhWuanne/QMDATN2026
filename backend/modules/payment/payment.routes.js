
const express = require("express");

const router = express.Router();

const paymentController = require("./payment.controller");

// ==========================================
// VNPAY CALLBACK ROUTES
// ==========================================

// VNPAY gọi trực tiếp từ server của họ.
// Không yêu cầu Customer đăng nhập.
router.get(
    "/vnpay/ipn",
    paymentController.handleVnpayIpn
);

module.exports = router;
