
const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:3000"
).replace(/\/+$/, "");

async function parseResponse(response) {
  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success === false) {
    const error = new Error(
      result.message || "Không thể tải thông tin hạng thành viên."
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

async function membershipRequest({
  accessToken,
  onSessionRefresh,
  onSessionExpired,
}) {
  const request = async (token) => {
    const response = await fetch(
      `${API_BASE_URL}/api/member/membership`,
      {
        method: "GET",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
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

export function getMyMembership({
  accessToken,
  onSessionRefresh,
  onSessionExpired,
}) {
  return membershipRequest({
    accessToken,
    onSessionRefresh,
    onSessionExpired,
  });
}
