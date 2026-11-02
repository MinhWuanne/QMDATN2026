const { z } = require("zod");

const forgotPasswordSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Email không hợp lệ")
      .max(255, "Email không được vượt quá 255 ký tự"),
  })
  .strict();

const resetPasswordSchema = z
  .object({
    token: z
      .string()
      .regex(/^[a-f0-9]{64}$/i, "Token không hợp lệ"),

    newPassword: z
      .string()
      .min(8, "Mật khẩu phải có ít nhất 8 ký tự"),
  })
  .strict();

module.exports = {
  forgotPasswordSchema,
  resetPasswordSchema,
};
