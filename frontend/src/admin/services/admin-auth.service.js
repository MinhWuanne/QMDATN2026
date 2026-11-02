const API = "/api/admin/auth";

export async function adminAuthRequest(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API}${path}`, {
      credentials: "include",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new Error("Không thể kết nối máy chủ. Vui lòng thử lại.");
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const messages = {
      INVALID_CREDENTIALS: "Email hoặc mật khẩu không chính xác.",
      ACCOUNT_NOT_ACTIVE: "Tài khoản Admin hiện không hoạt động.",
      VALIDATION_ERROR: "Thông tin đăng nhập không hợp lệ.",
      MISSING_REFRESH_TOKEN: "Phiên đăng nhập đã hết hạn.",
      REFRESH_TOKEN_EXPIRED: "Phiên đăng nhập đã hết hạn.",
    };

    throw new Error(
      messages[data.message] ||
      data.message ||
      "Đã xảy ra lỗi. Vui lòng thử lại."
    );
  }

  return data;
}
