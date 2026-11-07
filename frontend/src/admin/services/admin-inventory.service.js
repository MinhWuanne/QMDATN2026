import { adminAuthRequest } from "./admin-auth.service.js";

const API = "/api/admin/catalog";

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

function getErrorMessage(data) {
  const messages = {
    INVENTORY_NOT_FOUND: "Không tìm thấy thông tin tồn kho.",
    INVENTORY_VARIANT_NOT_FOUND: "Không tìm thấy biến thể sản phẩm.",
    INVENTORY_CONCURRENT_UPDATE:
      "Tồn kho vừa được cập nhật bởi một thao tác khác. Vui lòng tải lại.",
    INVENTORY_INSUFFICIENT_STOCK: "Số lượng tồn khả dụng không đủ.",
    INVENTORY_RESERVED_STOCK_CONFLICT:
      "Số lượng thực tế không được thấp hơn số lượng đã giữ.",
    INVENTORY_INVALID_ADJUSTMENT:
      "Số lượng điều chỉnh không hợp lệ.",
    PRODUCT_VARIANT_INACTIVE:
      "Không thể thao tác với biến thể đã ngừng hoạt động.",
    VALIDATION_ERROR: "Dữ liệu gửi lên không hợp lệ.",
    UNAUTHORIZED: "Phiên đăng nhập không hợp lệ.",
    INVALID_ACCESS_TOKEN: "Phiên đăng nhập đã hết hạn.",
    FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
    CSRF_VALIDATION_FAILED:
      "Yêu cầu không hợp lệ. Vui lòng tải lại trang.",
    INTERNAL_SERVER_ERROR: "Máy chủ gặp lỗi. Vui lòng thử lại.",
  };

  return (
    messages[data?.message] ||
    data?.message ||
    "Đã xảy ra lỗi."
  );
}

async function sendRequest(path, options, accessToken) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  let response;

  try {
    response = await fetch(`${API}${path}`, {
      ...options,
      credentials: "include",
      headers,
    });
  } catch {
    throw new Error(
      "Không thể kết nối máy chủ. Vui lòng thử lại."
    );
  }

  const data = await response.json().catch(() => ({}));

  return { response, data };
}

async function executeRequest(
  path,
  options,
  accessToken,
  onTokenRefreshed
) {
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
    throw new Error(getErrorMessage(result.data));
  }

  return result.data;
}

export function inventoryRequest(
  path,
  options = {},
  accessToken,
  onTokenRefreshed
) {
  return executeRequest(
    path,
    options,
    accessToken,
    onTokenRefreshed
  );
}

function buildQuery(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      query.set(key, String(value));
    }
  });

  return query.toString();
}

export const inventoryService = {
  list(params, accessToken, onTokenRefreshed) {
    const query = buildQuery(params);

    return inventoryRequest(
      `/inventory${query ? `?${query}` : ""}`,
      {},
      accessToken,
      onTokenRefreshed
    );
  },

  getByVariantId(variantId, accessToken, onTokenRefreshed) {
    return inventoryRequest(
      `/inventory/${variantId}`,
      {},
      accessToken,
      onTokenRefreshed
    );
  },

  listMovements(
    variantId,
    params,
    accessToken,
    onTokenRefreshed
  ) {
    const query = buildQuery(params);

    return inventoryRequest(
      `/inventory/${variantId}/movements${query ? `?${query}` : ""}`,
      {},
      accessToken,
      onTokenRefreshed
    );
  },

  purchase(payload, accessToken, onTokenRefreshed) {
    return inventoryRequest(
      "/inventory/purchase",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      accessToken,
      onTokenRefreshed
    );
  },

  adjustment(payload, accessToken, onTokenRefreshed) {
    return inventoryRequest(
      "/inventory/adjustment",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      accessToken,
      onTokenRefreshed
    );
  },
};