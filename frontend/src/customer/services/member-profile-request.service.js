
const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:3000"
).replace(/\/+$/, "");

async function parseResponse(response) {
  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success === false) {
    const error = new Error(
      result.message || "Không thể thực hiện yêu cầu hồ sơ."
    );

    error.status = response.status;
    error.code = result.code || result.message;

    const detail = Array.isArray(result.details)
      ? result.details[0]?.message
      : null;

    if (detail) {
      error.message = detail;
    }

    throw error;
  }

  return result.data ?? result;
}

async function profileRequest(
  path,
  options,
  accessToken,
  onSessionRefresh,
  onSessionExpired
) {
  const request = async (token) => {
    const response = await fetch(
      `${API_BASE_URL}/api/member/profile-requests${path}`,
      {
        ...options,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
          Authorization: `Bearer ${token}`,
        },
      }
    );

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

export function createMemberProfileRequest({
  requestedFullName,
  requestedPhone,
  accessToken,
  onSessionRefresh,
  onSessionExpired,
}) {
  return profileRequest(
    "",
    {
      method: "POST",
      body: JSON.stringify({
        requestedFullName,
        requestedPhone,
      }),
    },
    accessToken,
    onSessionRefresh,
    onSessionExpired
  );
}

export function getMemberProfileRequests({
  accessToken,
  onSessionRefresh,
  onSessionExpired,
  page = 1,
  limit = 20,
}) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  return profileRequest(
    `?${params.toString()}`,
    { method: "GET" },
    accessToken,
    onSessionRefresh,
    onSessionExpired
  );
}

export function getMemberProfileRequestDetail({
  requestId,
  accessToken,
  onSessionRefresh,
  onSessionExpired,
}) {
  if (!requestId) {
    throw new Error("ID yêu cầu không hợp lệ.");
  }

  return profileRequest(
    `/${encodeURIComponent(requestId)}`,
    { method: "GET" },
    accessToken,
    onSessionRefresh,
    onSessionExpired
  );
}
