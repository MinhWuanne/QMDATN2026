const { z } = require("zod");

const uuidSchema = z.string().uuid("ID địa chỉ không hợp lệ");

const addressFields = {
    recipientName: z.string()
        .trim()
        .min(1, "Vui lòng nhập tên người nhận")
        .max(150, "Tên người nhận tối đa 150 ký tự"),

    phone: z.string()
        .trim()
        .min(1, "Vui lòng nhập số điện thoại")
        .max(20, "Số điện thoại tối đa 20 ký tự"),

    provinceCity: z.string()
        .trim()
        .min(1, "Vui lòng nhập tỉnh/thành phố")
        .max(150, "Tỉnh/thành phố tối đa 150 ký tự"),

    district: z.string()
        .trim()
        .min(1, "Vui lòng nhập quận/huyện")
        .max(150, "Quận/huyện tối đa 150 ký tự"),

    street: z.string()
        .trim()
        .min(1, "Vui lòng nhập địa chỉ cụ thể")
        .max(255, "Địa chỉ cụ thể tối đa 255 ký tự"),

    addressNote: z.preprocess(
        (value) =>
            typeof value === "string" && value.trim() === ""
                ? null
                : value,
        z.string().trim().max(500, "Ghi chú tối đa 500 ký tự").nullable()
    ).optional(),
};

const addressIdParamsSchema = z.object({
    addressId: uuidSchema,
}).strict();

const createAddressSchema = z.object({
    ...addressFields,
    isDefault: z.boolean().optional(),
}).strict();

const updateAddressSchema = z.object({
    recipientName: addressFields.recipientName.optional(),
    phone: addressFields.phone.optional(),
    provinceCity: addressFields.provinceCity.optional(),
    district: addressFields.district.optional(),
    street: addressFields.street.optional(),
    addressNote: addressFields.addressNote.optional(),
})
    .strict()
    .refine(
        (value) => Object.keys(value).length > 0,
        {
            message: "Vui lòng cung cấp ít nhất một thông tin cần cập nhật",
        }
    );

module.exports = {
    addressIdParamsSchema,
    createAddressSchema,
    updateAddressSchema,
};


