
import { adminAuthRequest } from "./admin-auth.service.js";

const API = "/api/admin/members";

let refreshPromise = null;

// ==========================================
// REFRESH ADMIN SESSION
// ==========================================

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

// ==========================================
// ERROR MESSAGES
// ==========================================

const ERROR_MESSAGES = {
  VALIDATION_ERROR: "Thông tin yêu cầu không hợp lệ.",
  UNAUTHORIZED: "Phiên đăng nhập đã hết hạn.",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
  MEMBER_NOT_FOUND: "Không tìm thấy thành viên.",
  MEMBER_STATUS_INVALID: "Trạng thái thành viên không hợp lệ.",
  MEMBER_STATUS_UNCHANGED: "Trạng thái thành viên không có thay đổi.",
  MEMBER_CONCURRENT_UPDATE:
    "Dữ liệu thành viên vừa được thay đổi. Vui lòng tải lại.",
};

// ==========================================
// BASE REQUEST
// ==========================================

export async function adminMemberRequest(
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

  // Refresh session when access token expires.
  if (response.status === 401) {
    let refreshed;

    try {
      refreshed = await refreshSession();
    } catch {
      throw new Error(
        "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
      );
    }

    const newToken = refreshed?.tokens?.accessToken;

    if (!newToken || refreshed?.user?.role !== "ADMIN") {
      throw new Error(
        "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
      );
    }

    onTokenRefreshed?.({
      user: refreshed.user,
      accessToken: newToken,
    });

    ({ response, data } = await sendRequest(newToken));
  }

  if (!response.ok) {
    throw new Error(
      ERROR_MESSAGES[data.message] ||
      data.message ||
      "Đã xảy ra lỗi. Vui lòng thử lại."
    );
  }

  return data;
}

// ==========================================
// MEMBER SERVICE
// ==========================================

export const adminMemberService = {
  // GET /api/admin/members
  list(params = {}, accessToken, onTokenRefreshed) {
    const query = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        query.set(key, String(value));
      }
    });

    const suffix = query.toString()
      ? `?${query.toString()}`
      : "";

    return adminMemberRequest(
      suffix,
      { method: "GET" },
      accessToken,
      onTokenRefreshed
    );
  },

  // GET /api/admin/members/stats
  getStats(accessToken, onTokenRefreshed) {
    return adminMemberRequest(
      "/stats",
      { method: "GET" },
      accessToken,
      onTokenRefreshed
    );
  },

  // GET /api/admin/members/:id
  getById(memberId, accessToken, onTokenRefreshed) {
    return adminMemberRequest(
      `/${encodeURIComponent(memberId)}`,
      { method: "GET" },
      accessToken,
      onTokenRefreshed
    );
  },

  // PATCH /api/admin/members/:id/status
  updateStatus(memberId, payload, accessToken, onTokenRefreshed) {
    return adminMemberRequest(
      `/${encodeURIComponent(memberId)}/status`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
      accessToken,
      onTokenRefreshed
    );
  },
};
