const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:3000"
).replace(/\/+$/, "");

async function parseResponse(response) {
  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success === false) {
    const error = new Error(
      result.message || "Không thể thực hiện yêu cầu địa chỉ."
    );

    error.status = response.status;
    error.code = result.code || result.message;

    const detail = Array.isArray(result.details)
      ? result.details[0]?.message
      : null;

    if (detail) error.message = detail;

    throw error;
  }

  return result.data ?? result;
}

async function addressRequest(
  path,
  options,
  accessToken,
  onSessionRefresh,
  onSessionExpired
) {
  const request = async (token) => {
    const response = await fetch(
      `${API_BASE_URL}/api/member/addresses${path}`,
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
    if (error.status !== 401) throw error;

    try {
      if (typeof onSessionRefresh !== "function") {
        throw new Error("Không thể làm mới phiên đăng nhập.");
      }

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

function getRequestContext(context) {
  return {
    accessToken: context.accessToken,
    onSessionRefresh: context.onSessionRefresh,
    onSessionExpired: context.onSessionExpired,
  };
}

export function getMyAddresses(context) {
  const auth = getRequestContext(context);

  return addressRequest(
    "",
    { method: "GET" },
    auth.accessToken,
    auth.onSessionRefresh,
    auth.onSessionExpired
  );
}

export function createMyAddress(input, context) {
  const auth = getRequestContext(context);

  return addressRequest(
    "",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    auth.accessToken,
    auth.onSessionRefresh,
    auth.onSessionExpired
  );
}

export function updateMyAddress(addressId, input, context) {
  if (!addressId) {
    throw new Error("ID địa chỉ không hợp lệ.");
  }

  const auth = getRequestContext(context);

  return addressRequest(
    `/${encodeURIComponent(addressId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
    auth.accessToken,
    auth.onSessionRefresh,
    auth.onSessionExpired
  );
}

export function setMyDefaultAddress(addressId, context) {
  if (!addressId) {
    throw new Error("ID địa chỉ không hợp lệ.");
  }

  const auth = getRequestContext(context);

  return addressRequest(
    `/${encodeURIComponent(addressId)}/default`,
    { method: "PATCH" },
    auth.accessToken,
    auth.onSessionRefresh,
    auth.onSessionExpired
  );
}

export function deleteMyAddress(addressId, context) {
  if (!addressId) {
    throw new Error("ID địa chỉ không hợp lệ.");
  }

  const auth = getRequestContext(context);

  return addressRequest(
    `/${encodeURIComponent(addressId)}`,
    { method: "DELETE" },
    auth.accessToken,
    auth.onSessionRefresh,
    auth.onSessionExpired
  );
}