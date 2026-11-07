
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
    PRODUCT_NOT_FOUND: "Không tìm thấy sản phẩm.",
    PRODUCT_VARIANT_NOT_FOUND: "Không tìm thấy biến thể sản phẩm.",
    PRODUCT_SLUG_EXISTS: "Slug sản phẩm đã tồn tại.",
    PRODUCT_SKU_EXISTS: "SKU đã tồn tại.",
    PRODUCT_CONFLICT: "Sản phẩm bị trùng dữ liệu.",
    PRODUCT_ARCHIVED: "Sản phẩm đã được lưu trữ.",
    PRODUCT_ALREADY_ARCHIVED: "Sản phẩm đã được lưu trữ trước đó.",
    PRODUCT_NO_ACTIVE_VARIANTS: "Sản phẩm phải có ít nhất một Variant đang hoạt động.",
    PRODUCT_LAST_ACTIVE_VARIANT: "Không thể ngừng Variant hoạt động cuối cùng của sản phẩm ACTIVE.",
    PRODUCT_VARIANT_ALREADY_INACTIVE: "Variant đã ngừng hoạt động.",
    PRODUCT_VARIANT_INACTIVE: "Không thể chỉnh sửa Variant đã ngừng hoạt động.",
    CATEGORY_NOT_FOUND: "Không tìm thấy danh mục.",
    CATEGORY_INACTIVE: "Danh mục đang không hoạt động.",
    BRAND_NOT_FOUND: "Không tìm thấy thương hiệu.",
    BRAND_INACTIVE: "Thương hiệu đang không hoạt động.",
    VALIDATION_ERROR: "Dữ liệu không hợp lệ.",
    UNAUTHORIZED: "Phiên đăng nhập không hợp lệ.",
    INVALID_ACCESS_TOKEN: "Phiên đăng nhập đã hết hạn.",
    FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
    INTERNAL_SERVER_ERROR: "Máy chủ gặp lỗi. Vui lòng thử lại.",

    IMAGE_REQUIRED: "Vui lòng chọn ảnh.",
    INVALID_IMAGE_TYPE: "Định dạng ảnh không được hỗ trợ.",
    IMAGE_TOO_LARGE: "Ảnh vượt quá dung lượng cho phép.",
  };

  return (
    messages[data?.message] ||
    data?.message ||
    "Đã xảy ra lỗi."
  );
}

async function sendRequest(path, options = {}, accessToken) {
  const isFormData = options.body instanceof FormData;

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
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
      throw new Error(
        "Không thể làm mới phiên quản trị."
      );
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

export function productRequest(
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

export const productService = {

  uploadImage(type, file, accessToken, onTokenRefreshed) {
    const formData = new FormData();
    formData.append("image", file);

    return productRequest(
      `/images/${type}`,
      {
        method: "POST",
        body: formData,
      },
      accessToken,
      onTokenRefreshed
    );
  },

  list(params, accessToken, onTokenRefreshed) {
    const query = new URLSearchParams(params);

    return productRequest(
      `/products?${query.toString()}`,
      {},
      accessToken,
      onTokenRefreshed
    );
  },

  getById(id, accessToken, onTokenRefreshed) {
    return productRequest(
      `/products/${id}`,
      {},
      accessToken,
      onTokenRefreshed
    );
  },

  create(payload, accessToken, onTokenRefreshed) {
    return productRequest(
      "/products",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      accessToken,
      onTokenRefreshed
    );
  },

  update(id, payload, accessToken, onTokenRefreshed) {
    return productRequest(
      `/products/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
      accessToken,
      onTokenRefreshed
    );
  },

  updateStatus(id, status, accessToken, onTokenRefreshed) {
    return productRequest(
      `/products/${id}/status`,
      {
        method: "PATCH",
        body: JSON.stringify({ status }),
      },
      accessToken,
      onTokenRefreshed
    );
  },

  archive(id, accessToken, onTokenRefreshed) {
    return productRequest(
      `/products/${id}`,
      { method: "DELETE" },
      accessToken,
      onTokenRefreshed
    );
  },

  addVariant(productId, payload, accessToken, onTokenRefreshed) {
    return productRequest(
      `/products/${productId}/variants`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      accessToken,
      onTokenRefreshed
    );
  },

  updateVariant(
    productId,
    variantId,
    payload,
    accessToken,
    onTokenRefreshed
  ) {
    return productRequest(
      `/products/${productId}/variants/${variantId}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
      accessToken,
      onTokenRefreshed
    );
  },

  deactivateVariant(
    productId,
    variantId,
    accessToken,
    onTokenRefreshed
  ) {
    return productRequest(
      `/products/${productId}/variants/${variantId}`,
      { method: "DELETE" },
      accessToken,
      onTokenRefreshed
    );
  },
};
