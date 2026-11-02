const { z } = require("zod");

const adminLoginSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Email không hợp lệ")
      .max(255, "Email không được vượt quá 255 ký tự"),

    password: z
      .string()
      .min(1, "Vui lòng nhập mật khẩu"),
  })
  .strict();

module.exports = {
  adminLoginSchema,
};
