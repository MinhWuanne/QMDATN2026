
const paymentService = require("./payment.service");

// ==========================================
// VNPAY IPN
// ==========================================

async function handleVnpayIpn(req, res) {
    try {
        const result = await paymentService.processVnpayIpn(
            req.query
        );

        return res.status(200).json(result);
    } catch (error) {
        console.error("VNPAY IPN processing error:", {
            message: error.message,
            code: error.code,
        });

        // VNPAY cần nhận được phản hồi JSON kể cả khi
        // backend gặp lỗi xử lý nội bộ.
        return res.status(200).json({
            RspCode: "99",
            Message: "Unknown error",
        });
    }
}

module.exports = {
    handleVnpayIpn,
};
