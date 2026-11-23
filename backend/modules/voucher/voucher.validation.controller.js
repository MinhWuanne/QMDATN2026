
const orderService = require("../order/order.service");

async function validateVoucher(req, res, next) {
    try {
        const result = await orderService.previewOrderVoucher(
            req.user.id,
            req.body
        );

        return res.status(200).json({
            success: true,
            message: "Áp dụng mã giảm giá thành công.",
            data: result,
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    validateVoucher,
};
