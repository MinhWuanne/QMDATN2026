const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:3000"
).replace(/\/+$/, "");

async function parseResponse(response) {
  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success === false) {
    const error = new Error(
      result.message || "Không thể thực hiện yêu cầu Chat."
    );
    error.status = response.status;
    error.code = result.code;
    throw error;
  }

  return result.data ?? result;
}

async function chatRequest(
  path,
  options,
  accessToken,
  onSessionRefresh,
  onSessionExpired
) {
  const request = async (token) => {
    const response = await fetch(`${API_BASE_URL}/api/member/chat${path}`, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    });

    return parseResponse(response);
  };

  try {
    return await request(accessToken);
  } catch (error) {
    if (error.status !== 401) {
      throw error;
    }

    try {
      const session = await onSessionRefresh();

      if (!session?.accessToken) {
        throw new Error("Không thể làm mới phiên đăng nhập.");
      }

      return await request(session.accessToken);
    } catch (refreshError) {
      onSessionExpired?.();
      throw refreshError;
    }
  }
}

export function getMemberChatMessages({
  accessToken,
  onSessionRefresh,
  onSessionExpired,
  cursor,
  limit = 50,
}) {
  const params = new URLSearchParams();
  params.set("limit", String(limit));

  if (cursor) {
    params.set("cursor", cursor);
  }

  return chatRequest(
    `/messages?${params.toString()}`,
    { method: "GET" },
    accessToken,
    onSessionRefresh,
    onSessionExpired
  );
}

export function sendMemberChatMessage({
  content,
  accessToken,
  onSessionRefresh,
  onSessionExpired,
}) {
  return chatRequest(
    "/messages",
    {
      method: "POST",
      body: JSON.stringify({ content }),
    },
    accessToken,
    onSessionRefresh,
    onSessionExpired
  );
}
