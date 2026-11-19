const { z } = require("zod");

const registerSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(1, "Họ tên không được để trống")
      .max(150, "Họ tên không được vượt quá 150 ký tự"),

    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Email không hợp lệ")
      .max(255, "Email không được vượt quá 255 ký tự"),

    phone: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() === ""
          ? undefined
          : value,
      z.string().trim().max(20, "Số điện thoại quá dài").optional()
    ),

    password: z
      .string()
      .min(8, "Mật khẩu phải có ít nhất 8 ký tự"),
  })
  .strict();

const resendRegistrationOtpSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Email không hợp lệ")
      .max(255),
  })
  .strict();

const customerLoginSchema = z
  .object({
    identifier: z
      .string()
      .trim()
      .min(1, "Vui lòng nhập email hoặc số điện thoại")
      .max(255, "Thông tin đăng nhập quá dài"),

    password: z
      .string()
      .min(1, "Vui lòng nhập mật khẩu"),
  })
  .strict();

const verifyEmailSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Email không hợp lệ")
      .max(255, "Email không được vượt quá 255 ký tự"),

    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Mã OTP phải gồm 6 chữ số"),
  })
  .strict();

const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, "Vui lòng nhập mật khẩu hiện tại"),

    newPassword: z
      .string()
      .min(8, "Mật khẩu mới phải có ít nhất 8 ký tự"),

    confirmPassword: z
      .string()
      .min(1, "Vui lòng xác nhận mật khẩu mới"),
  })
  .strict()
  .refine(
    (data) => data.newPassword === data.confirmPassword,
    {
      path: ["confirmPassword"],
      message: "Mật khẩu xác nhận không khớp",
    }
  );

module.exports = {
  registerSchema,
  customerLoginSchema,
  resendRegistrationOtpSchema,
  verifyEmailSchema,
  changePasswordSchema,
};


