
import { adminAuthRequest } from "./admin-auth.service.js";

const API = "/api/admin/vouchers";

let refreshPromise = null;

async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = adminAuthRequest("/refresh", {
      method: "POST",
    }).finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

async function sendRequest(path, options, accessToken) {
  let response;

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  try {
    response = await fetch(`${API}${path}`, {
      ...options,
      credentials: "include",
      headers,
    });
  } catch {
    throw new Error("Không thể kết nối máy chủ. Vui lòng thử lại.");
  }

  const data = await response.json().catch(() => ({}));

  return { response, data };
}

function getErrorMessage(data) {
  const messages = {
    VOUCHER_NOT_FOUND: "Không tìm thấy Voucher.",
    VOUCHER_CODE_EXISTS: "Mã Voucher đã tồn tại.",
    VOUCHER_CONFLICT: "Voucher bị trùng dữ liệu.",
    VOUCHER_TERMS_LOCKED_AFTER_USAGE:
      "Không thể thay đổi điều kiện giảm giá vì Voucher đã được sử dụng.",
    VOUCHER_USAGE_LIMIT_BELOW_USED:
      "Giới hạn lượt sử dụng không được thấp hơn số lượt đã dùng.",
    VOUCHER_CONCURRENT_UPDATE:
      "Voucher vừa được thay đổi bởi một thao tác khác. Vui lòng tải lại dữ liệu.",
    VALIDATION_ERROR: "Dữ liệu không hợp lệ.",
    UNAUTHORIZED: "Phiên đăng nhập không hợp lệ.",
    INVALID_ACCESS_TOKEN: "Phiên đăng nhập đã hết hạn.",
    FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
    INTERNAL_SERVER_ERROR: "Máy chủ gặp lỗi. Vui lòng thử lại.",
  };

  return messages[data.message] || data.message || "Đã xảy ra lỗi.";
}

async function executeRequest(path, options, accessToken, onTokenRefreshed) {
  if (!accessToken) {
    throw new Error("Không tìm thấy phiên đăng nhập Admin.");
  }

  let result = await sendRequest(path, options, accessToken);

  if (result.response.status === 401) {
    let refreshed;

    try {
      refreshed = await refreshSession();
    } catch {
      throw new Error(
        "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
      );
    }

    if (
      refreshed.user?.role !== "ADMIN" ||
      !refreshed.tokens?.accessToken
    ) {
      throw new Error("Không thể làm mới phiên quản trị.");
    }

    const newToken = refreshed.tokens.accessToken;

    onTokenRefreshed?.({
      user: refreshed.user,
      accessToken: newToken,
    });

    result = await sendRequest(path, options, newToken);
  }

  if (!result.response.ok) {
    const error = new Error(getErrorMessage(result.data));

    error.code = result.data.message;
    error.details = result.data.details || [];

    throw error;
  }

  return result.data;
}

export function voucherRequest(
  path,
  options = {},
  accessToken,
  onTokenRefreshed
) {
  return executeRequest(path, options, accessToken, onTokenRefreshed);
}
