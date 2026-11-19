const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:3000"
).replace(/\/+$/, "");

async function catalogRequest(path) {
  const response = await fetch(`${API_BASE_URL}/api/catalog${path}`, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success === false) {
    const error = new Error(
      result.message || "Không thể tải dữ liệu cửa hàng."
    );
    error.status = response.status;
    error.code = result.code;
    throw error;
  }

  return result;
}

export function getCustomerCatalogProducts({
  page = 1,
  limit = 50,
  sortBy = "createdAt",
  sortOrder = "desc",
  search,
  categoryId,
  brandId,
  featured,
} = {}) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    sortBy,
    sortOrder,
  });

  if (search) params.set("search", search);
  if (categoryId) params.set("categoryId", categoryId);
  if (brandId) params.set("brandId", brandId);
  if (featured !== undefined) params.set("featured", String(featured));

  return catalogRequest(`/products?${params.toString()}`);
}

export function getCustomerCatalogProduct(identifier) {
  if (!identifier) {
    throw new Error("Thiếu mã hoặc slug sản phẩm.");
  }

  return catalogRequest(`/products/${encodeURIComponent(identifier)}`);
}

export function getCustomerCatalogCategories() {
  return catalogRequest("/categories");
}

export function getCustomerCatalogBrands() {
  return catalogRequest("/brands");
}
