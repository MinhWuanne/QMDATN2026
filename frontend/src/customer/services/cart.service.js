
const API = "/api/cart";

function getErrorMessage(data, fallback) {
  const code = data?.message;

  const detail = Array.isArray(data?.details)
    ? data.details[0]?.message
    : Object.values(data?.details || {}).flat()[0];

  const messages = {
    CART_ITEM_NOT_FOUND: "Sản phẩm không còn trong giỏ hàng.",
    CART_INSUFFICIENT_STOCK:
      "Số lượng yêu cầu vượt quá số lượng hàng còn lại.",
    CART_CONFLICT:
      "Giỏ hàng vừa được cập nhật ở nơi khác. Vui lòng thử lại.",
    CART_CONCURRENT_UPDATE:
      "Giỏ hàng đang được cập nhật. Vui lòng thử lại.",
    PRODUCT_VARIANT_NOT_FOUND: "Không tìm thấy phân loại sản phẩm.",
    PRODUCT_VARIANT_INACTIVE:
      "Phân loại sản phẩm hiện không còn được kinh doanh.",
    VALIDATION_ERROR: "Thông tin gửi lên không hợp lệ.",
    ACCOUNT_NOT_ACTIVE: "Tài khoản hiện không hoạt động.",
    INVALID_USER_ROLE: "Tài khoản không có quyền thực hiện thao tác này.",
  };

  return (
    messages[code] ||
    (typeof detail === "string" ? detail : null) ||
    code ||
    fallback
  );
}

async function cartRequest(path = "", {
  accessToken,
  method = "GET",
  body,
} = {}) {
  if (!accessToken) {
    throw new Error(
      "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại."
    );
  }

  const response = await fetch(`${API}${path}`, {
    method,
    credentials: "include",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
    },
    ...(body !== undefined
      ? { body: JSON.stringify(body) }
      : {}),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success === false) {
    const error = new Error(
      getErrorMessage(data, "Không thể xử lý giỏ hàng. Vui lòng thử lại.")
    );

    error.status = response.status;
    error.code = data.message;

    throw error;
  }

  return data.data;
}

/**
 * Lấy giỏ hàng Customer hiện tại.
 */
export function getCustomerCart(accessToken) {
  return cartRequest("", { accessToken });
}

/**
 * Thêm một phân loại sản phẩm vào giỏ.
 */
export function addCustomerCartItem({
  accessToken,
  variantId,
  quantity = 1,
}) {
  return cartRequest("/items", {
    accessToken,
    method: "POST",
    body: {
      variantId,
      quantity,
    },
  });
}

/**
 * Cập nhật số lượng một sản phẩm trong giỏ.
 */
export function updateCustomerCartItem({
  accessToken,
  itemId,
  quantity,
}) {
  if (!itemId) {
    throw new Error("Thiếu mã sản phẩm trong giỏ hàng.");
  }

  return cartRequest(`/items/${encodeURIComponent(itemId)}`, {
    accessToken,
    method: "PATCH",
    body: {
      quantity,
    },
  });
}

/**
 * Xóa một sản phẩm khỏi giỏ.
 */
export function removeCustomerCartItem({
  accessToken,
  itemId,
}) {
  if (!itemId) {
    throw new Error("Thiếu mã sản phẩm trong giỏ hàng.");
  }

  return cartRequest(`/items/${encodeURIComponent(itemId)}`, {
    accessToken,
    method: "DELETE",
  });
}

/**
 * Xóa toàn bộ sản phẩm trong giỏ.
 */
export function clearCustomerCart(accessToken) {
  return cartRequest("/items", {
    accessToken,
    method: "DELETE",
  });
}
