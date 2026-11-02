const API = "/api/auth";

const ERROR_MESSAGES = {
  INVALID_CREDENTIALS: "Email, số điện thoại hoặc mật khẩu không chính xác.",
  EMAIL_NOT_VERIFIED: "Email của bạn chưa được xác minh.",
  ACCOUNT_LOCKED: "Tài khoản đã bị khóa.",
  ACCOUNT_NOT_ACTIVE: "Tài khoản hiện không hoạt động.",
  EMAIL_ALREADY_EXISTS: "Email này đã được sử dụng.",
  PHONE_ALREADY_EXISTS: "Số điện thoại này đã được sử dụng.",
  REGISTRATION_EMAIL_DELIVERY_FAILED:
    "Không thể gửi mã xác minh. Vui lòng thử lại sau.",
  OTP_EMAIL_DELIVERY_FAILED:
    "Không thể gửi mã xác minh. Vui lòng thử lại sau.",
  OTP_INVALID_OR_UNAVAILABLE:
    "Mã xác minh không chính xác hoặc đã hết hạn.",
  OTP_INVALID: "Mã xác minh không chính xác.",
  OTP_EXPIRED: "Mã xác minh đã hết hạn. Hãy yêu cầu mã mới.",
  OTP_MAX_ATTEMPTS_EXCEEDED:
    "Bạn đã nhập sai quá 5 lần. Hãy yêu cầu mã xác minh mới.",
  OTP_RESEND_TOO_SOON:
    "Bạn cần chờ trước khi yêu cầu gửi mã mới.",
  OTP_SEND_LIMIT_EXCEEDED:
    "Bạn đã đạt giới hạn gửi mã trong giờ này. Vui lòng thử lại sau.",
  INVALID_OR_EXPIRED_RESET_TOKEN:
    "Liên kết đã hết hạn hoặc không còn hợp lệ. Hãy yêu cầu liên kết mới.",
  CSRF_VALIDATION_FAILED:
    "Yêu cầu bảo mật không hợp lệ. Vui lòng tải lại trang.",
};

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success === false) {
    const code = data.message;

    const detail = Array.isArray(data.details)
      ? data.details[0]?.message
      : Object.values(data.details || {}).flat()[0];

    throw new Error(
      ERROR_MESSAGES[code] ||
      (typeof detail === "string" ? detail : null) ||
      code ||
      "Đã xảy ra lỗi. Vui lòng thử lại."
    );
  }

  return data;
}
