
import { refreshAdminSession } from "./admin-auth.service.js";

const API = "/api/admin/member-profile-requests";

async function request(path, options = {}, accessToken, onTokenRefreshed) {
  const send = async (token) => {
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

  let { response, data } = await send(accessToken);

  if (response.status === 401) {
    let refreshed;

    try {
      refreshed = await refreshAdminSession();
    } catch {
      throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
    }

    const token = refreshed?.tokens?.accessToken;

    if (!token || refreshed?.user?.role !== "ADMIN") {
      throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
    }

    onTokenRefreshed?.({
      user: refreshed.user,
      accessToken: token,
    });

    ({ response, data } = await send(token));
  }

  if (!response.ok || data.success === false) {
    const messages = {
      MEMBER_PROFILE_REQUEST_NOT_FOUND:
        "Không tìm thấy yêu cầu cập nhật hồ sơ.",
      MEMBER_PROFILE_REQUEST_ALREADY_PENDING:
        "Yêu cầu đã được xử lý hoặc không còn ở trạng thái chờ duyệt.",
      MEMBER_PROFILE_REQUEST_CANNOT_BE_APPROVED:
        "Yêu cầu không còn ở trạng thái chờ duyệt.",
      MEMBER_PROFILE_REQUEST_CANNOT_BE_REJECTED:
        "Không thể từ chối yêu cầu ở trạng thái hiện tại.",
      PHONE_ALREADY_EXISTS:
        "Số điện thoại này đã được sử dụng bởi tài khoản khác.",
      MEMBER_PROFILE_REQUEST_CONCURRENT_UPDATE:
        "Dữ liệu vừa được cập nhật ở nơi khác. Vui lòng tải lại.",
    };

    throw new Error(
      messages[data.message] ||
      data.message ||
      "Không thể thực hiện thao tác."
    );
  }

  return data.data ?? data;
}

function queryString(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });

  return query.toString();
}

export const adminMemberProfileRequestService = {
  list(params, token, onTokenRefreshed) {
    const query = queryString(params);

    return request(
      query ? `?${query}` : "",
      { method: "GET" },
      token,
      onTokenRefreshed
    );
  },

  getById(id, token, onTokenRefreshed) {
    return request(
      `/${encodeURIComponent(id)}`,
      { method: "GET" },
      token,
      onTokenRefreshed
    );
  },

  approve(id, payload, token, onTokenRefreshed) {
    return request(
      `/${encodeURIComponent(id)}/approve`,
      {
        method: "POST",
        body: JSON.stringify(payload || {}),
      },
      token,
      onTokenRefreshed
    );
  },

  reject(id, payload, token, onTokenRefreshed) {
    return request(
      `/${encodeURIComponent(id)}/reject`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      token,
      onTokenRefreshed
    );
  },
};
