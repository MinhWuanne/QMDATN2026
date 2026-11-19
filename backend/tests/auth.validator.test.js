const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  registerSchema,
  customerLoginSchema,
  changePasswordSchema,
} = require("../modules/auth/customer/customer-auth.validator");

const {
  adminLoginSchema,
} = require("../modules/auth/admin/admin-auth.validator");

test("Đăng ký với dữ liệu hợp lệ", () => {
  const result = registerSchema.safeParse({
    fullName: "Nguyen Van A",
    email: "test@example.com",
    phone: "0912345678",
    password: "password123",
  });

  assert.equal(result.success, true);
});

test("Email được chuẩn hóa thành chữ thường", () => {
  const result = registerSchema.safeParse({
    fullName: "Nguyen Van A",
    email: "  TEST@EXAMPLE.COM  ",
    password: "password123",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.email, "test@example.com");
});

test("Họ tên được loại bỏ khoảng trắng thừa", () => {
  const result = registerSchema.safeParse({
    fullName: "  Nguyen Van A  ",
    email: "test@example.com",
    password: "password123",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.fullName, "Nguyen Van A");
});

test("Số điện thoại để trống được xem là không cung cấp", () => {
  const result = registerSchema.safeParse({
    fullName: "Nguyen Van A",
    email: "test@example.com",
    phone: "   ",
    password: "password123",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.phone, undefined);
});

test("Từ chối email không hợp lệ", () => {
  const result = registerSchema.safeParse({
    fullName: "Nguyen Van A",
    email: "invalid-email",
    password: "password123",
  });

  assert.equal(result.success, false);
});

test("Từ chối mật khẩu dưới 8 ký tự", () => {
  const result = registerSchema.safeParse({
    fullName: "Nguyen Van A",
    email: "test@example.com",
    password: "1234567",
  });

  assert.equal(result.success, false);
});

test("Từ chối dữ liệu có trường role", () => {
  const result = registerSchema.safeParse({
    fullName: "Nguyen Van A",
    email: "test@example.com",
    password: "password123",
    role: "ADMIN",
  });

  assert.equal(result.success, false);
});

test("Từ chối họ tên chỉ chứa khoảng trắng", () => {
  const result = registerSchema.safeParse({
    fullName: "   ",
    email: "test@example.com",
    password: "password123",
  });

  assert.equal(result.success, false);
});

// CUSTOMER LOGIN

test("Customer đăng nhập bằng email", () => {
  const result = customerLoginSchema.safeParse({
    identifier: "test@example.com",
    password: "password123",
  });

  assert.equal(result.success, true);
});

test("Customer đăng nhập bằng số điện thoại", () => {
  const result = customerLoginSchema.safeParse({
    identifier: "0912345678",
    password: "password123",
  });

  assert.equal(result.success, true);
});

test("Customer identifier được loại bỏ khoảng trắng hai đầu", () => {
  const result = customerLoginSchema.safeParse({
    identifier: "  test@example.com  ",
    password: "password123",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.identifier, "test@example.com");
});

test("Mật khẩu đăng nhập không bị thay đổi khoảng trắng", () => {
  const result = customerLoginSchema.safeParse({
    identifier: "test@example.com",
    password: " password123 ",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.password, " password123 ");
});

test("Customer không được bỏ trống identifier hoặc password", () => {
  const result = customerLoginSchema.safeParse({
    identifier: "   ",
    password: "",
  });

  assert.equal(result.success, false);
});

test("Customer không được tự gửi thêm trường role", () => {
  const result = customerLoginSchema.safeParse({
    identifier: "test@example.com",
    password: "password123",
    role: "ADMIN",
  });

  assert.equal(result.success, false);
});

// ADMIN LOGIN

test("Admin đăng nhập bằng email hợp lệ", () => {
  const result = adminLoginSchema.safeParse({
    email: "admin@example.com",
    password: "password123",
  });

  assert.equal(result.success, true);
});

test("Email Admin được chuẩn hóa thành chữ thường", () => {
  const result = adminLoginSchema.safeParse({
    email: "  ADMIN@EXAMPLE.COM  ",
    password: "password123",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.email, "admin@example.com");
});

test("Admin từ chối email không hợp lệ hoặc thiếu mật khẩu", () => {
  const result = adminLoginSchema.safeParse({
    email: "invalid-email",
    password: "",
  });

  assert.equal(result.success, false);
});

// CUSTOMER CHANGE PASSWORD

test("Customer đổi mật khẩu với dữ liệu hợp lệ", () => {
  const result = changePasswordSchema.safeParse({
    currentPassword: "oldPassword123",
    newPassword: "newPassword123",
    confirmPassword: "newPassword123",
  });

  assert.equal(result.success, true);
});

test("Từ chối mật khẩu hiện tại bị bỏ trống", () => {
  const result = changePasswordSchema.safeParse({
    currentPassword: "",
    newPassword: "newPassword123",
    confirmPassword: "newPassword123",
  });

  assert.equal(result.success, false);
});

test("Từ chối mật khẩu mới dưới 8 ký tự", () => {
  const result = changePasswordSchema.safeParse({
    currentPassword: "oldPassword123",
    newPassword: "1234567",
    confirmPassword: "1234567",
  });

  assert.equal(result.success, false);
});

test("Từ chối khi mật khẩu xác nhận không khớp", () => {
  const result = changePasswordSchema.safeParse({
    currentPassword: "oldPassword123",
    newPassword: "newPassword123",
    confirmPassword: "anotherPassword123",
  });

  assert.equal(result.success, false);
});

test("Không tự ý thay đổi khoảng trắng trong mật khẩu", () => {
  const result = changePasswordSchema.safeParse({
    currentPassword: " oldPassword123 ",
    newPassword: " newPassword123 ",
    confirmPassword: " newPassword123 ",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.currentPassword, " oldPassword123 ");
  assert.equal(result.data.newPassword, " newPassword123 ");
});

test("Từ chối dữ liệu có field không được khai báo", () => {
  const result = changePasswordSchema.safeParse({
    currentPassword: "oldPassword123",
    newPassword: "newPassword123",
    confirmPassword: "newPassword123",
    email: "test@example.com",
  });

  assert.equal(result.success, false);
});