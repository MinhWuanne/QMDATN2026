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

async function sendRequest(path, options, accessToken) {
  let response;

  const isFormData = options.body instanceof FormData;

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers || {}),
  };

  try {
    response = await fetch(`${API}${path}`, {
      ...options,
      credentials: "include",
      headers,
    });
  } catch {
    throw new Error("Không thể kết nối máy chủ. Vui lòng thử lại.");
  }

  const data = await response.json().catch(() => ({}));

  return { response, data };
}

function getErrorMessage(data) {
  const messages = {
    CATEGORY_NOT_FOUND: "Không tìm thấy danh mục.",
    BRAND_NOT_FOUND: "Không tìm thấy thương hiệu.",
    CATEGORY_SLUG_EXISTS: "Slug danh mục đã tồn tại.",
    BRAND_SLUG_EXISTS: "Slug thương hiệu đã tồn tại.",
    CATEGORY_IN_USE: "Danh mục đang được sử dụng.",
    BRAND_IN_USE: "Thương hiệu đang được sử dụng.",
    CATEGORY_CONFLICT: "Danh mục bị trùng dữ liệu.",
    BRAND_CONFLICT: "Thương hiệu bị trùng dữ liệu.",
    VALIDATION_ERROR: "Dữ liệu không hợp lệ.",
    UNAUTHORIZED: "Phiên đăng nhập không hợp lệ.",
    INVALID_ACCESS_TOKEN: "Phiên đăng nhập đã hết hạn.",
    FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
    CATEGORY_NAME_EXISTS: "Tên danh mục đã tồn tại.",
    BRAND_NAME_EXISTS: "Tên thương hiệu đã tồn tại.",
    CSRF_VALIDATION_FAILED: "Yêu cầu không hợp lệ. Vui lòng tải lại trang.",
    IMAGE_REQUIRED: "Vui lòng chọn ảnh cần tải lên.",
    IMAGE_TOO_LARGE: "Ảnh vượt quá dung lượng cho phép (5MB).",
    INVALID_IMAGE_TYPE: "Chỉ chấp nhận ảnh JPG, PNG hoặc WebP.",
    IMAGE_UPLOAD_INVALID: "File ảnh không hợp lệ.",
    INVALID_IMAGE_TYPE: "Định dạng ảnh không được hỗ trợ.",
    INTERNAL_SERVER_ERROR: "Máy chủ gặp lỗi. Vui lòng thử lại.",
  };

  return messages[data.message] || data.message || "Đã xảy ra lỗi.";
}

async function executeRequest(path, options, accessToken, onTokenRefreshed) {
  if (!accessToken) {
    throw new Error("Không tìm thấy phiên đăng nhập Admin.");
  }

  let result = await sendRequest(path, options, accessToken);

  if (result.response.status === 401) {
    let refreshed;

    try {
      refreshed = await refreshSession();
    } catch {
      throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
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

export function catalogRequest(
  path,
  options = {},
  accessToken,
  onTokenRefreshed
) {
  return executeRequest(path, options, accessToken, onTokenRefreshed);
}

export function catalogUploadRequest(
  type,
  file,
  accessToken,
  onTokenRefreshed
) {
  const formData = new FormData();
  formData.append("image", file);

  return executeRequest(
    `/images/${type}`,
    {
      method: "POST",
      body: formData,
    },
    accessToken,
    onTokenRefreshed
  );
}