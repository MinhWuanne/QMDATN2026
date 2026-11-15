
import { refreshAdminSession } from "./admin-auth.service.js";

const API = "/api/admin/chat";

const ERROR_MESSAGES = {
  VALIDATION_ERROR: "Thông tin yêu cầu không hợp lệ.",
  UNAUTHORIZED: "Phiên đăng nhập đã hết hạn.",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
  CHAT_CONVERSATION_NOT_FOUND: "Không tìm thấy hội thoại.",
  CHAT_CONVERSATION_CLOSED: "Hội thoại đã đóng, không thể gửi tin nhắn.",
  CHAT_CONVERSATION_ALREADY_CLOSED: "Hội thoại đã được đóng trước đó.",
  CHAT_MESSAGE_CURSOR_INVALID: "Vị trí tải tin nhắn không hợp lệ.",
  CHAT_CONCURRENT_UPDATE: "Hội thoại vừa được cập nhật. Vui lòng thử lại.",
};

export async function adminChatRequest(
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
      refreshed = await refreshAdminSession();
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
    throw new Error(
      ERROR_MESSAGES[data.message] ||
      data.message ||
      "Đã xảy ra lỗi. Vui lòng thử lại."
    );
  }

  return data;
}

function buildQuery(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });

  const suffix = query.toString();
  return suffix ? `?${suffix}` : "";
}

export const adminChatService = {
  // GET /api/admin/chat/conversations
  listConversations(params = {}, accessToken, onTokenRefreshed) {
    return adminChatRequest(
      `/conversations${buildQuery(params)}`,
      { method: "GET" },
      accessToken,
      onTokenRefreshed
    );
  },

  // GET /api/admin/chat/conversations/:id/messages
  getMessages(conversationId, params = {}, accessToken, onTokenRefreshed) {
    return adminChatRequest(
      `/conversations/${encodeURIComponent(conversationId)}/messages${buildQuery(params)}`,
      { method: "GET" },
      accessToken,
      onTokenRefreshed
    );
  },

  // POST /api/admin/chat/conversations/:id/messages
  sendMessage(conversationId, content, accessToken, onTokenRefreshed) {
    return adminChatRequest(
      `/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ content }),
      },
      accessToken,
      onTokenRefreshed
    );
  },

  // PATCH /api/admin/chat/conversations/:id/close
  closeConversation(conversationId, accessToken, onTokenRefreshed) {
    return adminChatRequest(
      `/conversations/${encodeURIComponent(conversationId)}/close`,
      { method: "PATCH" },
      accessToken,
      onTokenRefreshed
    );
  },
};
