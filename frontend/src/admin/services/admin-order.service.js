
import { adminAuthRequest } from "./admin-auth.service.js";

const API = "/api/admin/orders";

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

export async function adminOrderRequest(
  path,
  options = {},
  accessToken,
  onTokenRefreshed
) {
  const sendRequest = async (token) => {
    let response;

    try {
      response = await fetch(`${API}${path}`, {
        credentials: "include",
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    } catch {
      throw new Error("Không thể kết nối máy chủ. Vui lòng thử lại.");
    }

    const data = await response.json().catch(() => ({}));

    return { response, data };
  };

  let { response, data } = await sendRequest(accessToken);

  if (response.status === 401) {
    let refreshed;

    try {
      refreshed = await refreshSession();
    } catch {
      throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
    }

    const newToken = refreshed?.tokens?.accessToken;

    if (!newToken || refreshed?.user?.role !== "ADMIN") {
      throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
    }

    onTokenRefreshed?.({
      user: refreshed.user,
      accessToken: newToken,
    });

    ({ response, data } = await sendRequest(newToken));
  }

  if (!response.ok) {
    const messages = {
      VALIDATION_ERROR: "Thông tin yêu cầu không hợp lệ.",
      UNAUTHORIZED: "Phiên đăng nhập đã hết hạn.",
      FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
      ORDER_NOT_FOUND: "Không tìm thấy đơn hàng.",
      INVALID_ORDER_STATUS: "Trạng thái đơn hàng không hợp lệ.",
      PAYMENT_NOT_PAID: "Đơn hàng chưa được thanh toán.",
      INSUFFICIENT_STOCK: "Số lượng tồn kho không đủ.",
    };

    throw new Error(
      messages[data.message] ||
      data.message ||
      "Đã xảy ra lỗi. Vui lòng thử lại."
    );
  }

  return data;
}

export const adminOrderService = {
  list(params = {}, accessToken, onTokenRefreshed) {
    const query = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        query.set(key, String(value));
      }
    });

    const suffix = query.toString() ? `?${query.toString()}` : "";

    return adminOrderRequest(
      suffix,
      { method: "GET" },
      accessToken,
      onTokenRefreshed
    );
  },

  getById(orderId, accessToken, onTokenRefreshed) {
    return adminOrderRequest(
      `/${encodeURIComponent(orderId)}`,
      { method: "GET" },
      accessToken,
      onTokenRefreshed
    );
  },

  updateStatus(orderId, payload, accessToken, onTokenRefreshed) {
    return adminOrderRequest(
      `/${encodeURIComponent(orderId)}/status`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
      accessToken,
      onTokenRefreshed
    );
  },

  markPaid(orderId, payload = {}, accessToken, onTokenRefreshed) {
    return adminOrderRequest(
      `/${encodeURIComponent(orderId)}/mark-paid`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      accessToken,
      onTokenRefreshed
    );
  },

  cancel(orderId, payload = {}, accessToken, onTokenRefreshed) {
    return adminOrderRequest(
      `/${encodeURIComponent(orderId)}/cancel`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      accessToken,
      onTokenRefreshed
    );
  },
};
