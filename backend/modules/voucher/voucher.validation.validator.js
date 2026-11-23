
const { z } = require("zod");

const validateVoucherSchema = z.object({
    code: z
        .string()
        .trim()
        .min(1, "Vui lòng nhập mã giảm giá")
        .max(50, "Mã giảm giá không được vượt quá 50 ký tự"),

    selectedCartItemIds: z
        .array(z.string().uuid())
        .min(1, "Vui lòng chọn ít nhất một sản phẩm")
        .max(100, "Không được chọn quá 100 sản phẩm")
        .refine(
            (ids) => new Set(ids).size === ids.length,
            "Danh sách sản phẩm không được trùng lặp"
        ),
});

module.exports = {
    validateVoucherSchema,
};
