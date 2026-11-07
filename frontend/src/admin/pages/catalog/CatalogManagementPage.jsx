
import { useCallback, useEffect, useState } from "react";
import {
  catalogRequest,
  catalogUploadRequest,
} from "../../services/admin-catalog.service.js";

const CONFIG = {
  categories: {
    title: "Danh mục",
    singular: "danh mục",
    endpoint: "/categories",
    nameLabel: "Tên danh mục",
    imageLabel: "Ảnh danh mục",
    imageField: "imageUrl",
    countLabel: "Sản phẩm",
    fields: ["name", "slug", "description", "imageUrl", "isActive", "sortOrder"],
    initial: {
      name: "",
      slug: "",
      description: "",
      imageUrl: "",
      isActive: true,
      sortOrder: 0,
    },
  },
  brands: {
    title: "Thương hiệu",
    singular: "thương hiệu",
    endpoint: "/brands",
    nameLabel: "Tên thương hiệu",
    imageLabel: "Logo thương hiệu",
    imageField: "logoUrl",
    countLabel: "Sản phẩm",
    fields: ["name", "slug", "description", "logoUrl", "isActive"],
    initial: {
      name: "",
      slug: "",
      description: "",
      logoUrl: "",
      isActive: true,
    },
  },
};

function normalizeForm(item, config) {
  if (!item) return { ...config.initial };

  return {
    ...config.initial,
    ...item,
    [config.imageField]: item[config.imageField] || "",
    description: item.description || "",
    slug: item.slug || "",
    isActive: item.isActive ?? true,
  };
}

function getProductCount(item) {
  return item?._count?.products ?? 0;
}

export default function CatalogManagementPage({
  type,
  accessToken,
  onSessionUpdate,
  onSessionExpired,
}) {
  const config = CONFIG[type];

  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({ ...config.initial });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [imagePreview, setImagePreview] = useState("");
  const [imageUploading, setImageUploading] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
      });

      if (search.trim()) params.set("search", search.trim());
      if (status !== "all") params.set("isActive", status);

      const result = await catalogRequest(
        `${config.endpoint}?${params.toString()}`,
        {},
        accessToken,
        onSessionUpdate
      );

      setItems(Array.isArray(result.items) ? result.items : []);
      setPagination((current) => ({
        ...current,
        ...(result.pagination || {}),
      }));
    } catch (err) {
      setError(err.message || "Không thể tải dữ liệu.");
      if (err.message?.includes("Phiên đăng nhập đã hết hạn")) {
        onSessionExpired?.();
      }
    } finally {
      setLoading(false);
    }
  }, [
    accessToken,
    config.endpoint,
    onSessionExpired,
    onSessionUpdate,
    pagination.page,
    pagination.limit,
    search,
    status,
  ]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    return () => {
      if (imagePreview?.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  function openCreateModal() {
    setEditingItem(null);
    setForm({ ...config.initial });
    setError("");
    setModalOpen(true);
    setImagePreview("");
  }

  function openEditModal(item) {
    setEditingItem(item);
    setForm(normalizeForm(item, config));
    setError("");
    setModalOpen(true);
    setImagePreview(item[config.imageField] || "");
  }

  function closeModal() {
    if (saving || imageUploading) return;
    setModalOpen(false);
    setEditingItem(null);
  }

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleImageSelect(event) {
    const file = event.target.files?.[0];

    // Cho phép chọn lại cùng một file ở lần sau.
    event.target.value = "";

    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      setError("Chỉ chấp nhận ảnh JPG, PNG hoặc WebP.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Ảnh vượt quá dung lượng cho phép (5MB).");
      return;
    }

    const localPreview = URL.createObjectURL(file);

    setImagePreview(localPreview);
    setImageUploading(true);
    setError("");
    setNotice("");

    try {
      const uploadType = type === "categories" ? "category" : "brand";

      const result = await catalogUploadRequest(
        uploadType,
        file,
        accessToken,
        onSessionUpdate
      );

      const uploadedUrl = result.data?.url;

      if (!uploadedUrl) {
        throw new Error("Không nhận được URL ảnh từ máy chủ.");
      }

      updateForm(config.imageField, uploadedUrl);
      setImagePreview(uploadedUrl);
      setNotice("Đã tải ảnh lên thành công.");
    } catch (err) {
      setImagePreview(form[config.imageField] || "");
      setError(err.message || "Không thể tải ảnh lên.");

      if (err.message?.includes("Phiên đăng nhập đã hết hạn")) {
        onSessionExpired?.();
      }
    } finally {
      setImageUploading(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError("");
    setNotice("");

    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim() || undefined,
      description: form.description.trim() || null,
      [config.imageField]: form[config.imageField].trim() || null,
      isActive: Boolean(form.isActive),
    };

    if (type === "categories") {
      payload.sortOrder = Number(form.sortOrder);
    }

    try {
      const path = editingItem
        ? `${config.endpoint}/${editingItem.id}`
        : config.endpoint;

      await catalogRequest(
        path,
        {
          method: editingItem ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
        accessToken,
        onSessionUpdate
      );

      setModalOpen(false);
      setEditingItem(null);
      setNotice(
        editingItem
          ? `Đã cập nhật ${config.singular}.`
          : `Đã tạo ${config.singular} mới.`
      );

      if (pagination.page !== 1) {
        setPagination((current) => ({ ...current, page: 1 }));
      } else {
        await loadItems();
      }
    } catch (err) {
      setError(err.message || "Không thể lưu dữ liệu.");
      if (err.message?.includes("Phiên đăng nhập đã hết hạn")) {
        onSessionExpired?.();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item) {
    const productCount = getProductCount(item);
    const action = productCount > 0 ? "ngừng kích hoạt" : "xóa";

    const confirmed = window.confirm(
      productCount > 0
        ? `${config.nameLabel} "${item.name}" đang được ${productCount} sản phẩm sử dụng. Bạn muốn ngừng kích hoạt mục này?`
        : `Bạn có chắc muốn xóa ${config.singular} "${item.name}"?`
    );

    if (!confirmed || deletingId) return;

    setDeletingId(item.id);
    setError("");
    setNotice("");

    try {
      const result = await catalogRequest(
        `${config.endpoint}/${item.id}`,
        { method: "DELETE" },
        accessToken,
        onSessionUpdate
      );

      setNotice(
        result.message ===
          (type === "categories"
            ? "CATEGORY_DEACTIVATED"
            : "BRAND_DEACTIVATED")
          ? `Đã ngừng kích hoạt ${config.singular}.`
          : `Đã xóa ${config.singular}.`
      );

      await loadItems();
    } catch (err) {
      setError(err.message || "Không thể xóa dữ liệu.");
      if (err.message?.includes("Phiên đăng nhập đã hết hạn")) {
        onSessionExpired?.();
      }
    } finally {
      setDeletingId(null);
    }
  }

  function submitSearch(event) {
    event.preventDefault();
    setPagination((current) => ({ ...current, page: 1 }));
    setSearch(searchInput.trim());
  }

  function changeStatus(value) {
    setStatus(value);
    setPagination((current) => ({ ...current, page: 1 }));
  }

  const pageCount = pagination.totalPages || 0;
  const start =
    pagination.total === 0
      ? 0
      : (pagination.page - 1) * pagination.limit + 1;
  const end = Math.min(
    pagination.page * pagination.limit,
    pagination.total
  );

  if (!config) {
    return <div className="catalog-error">Trang quản lý không hợp lệ.</div>;
  }

  return (
    <section className="catalog-page">
      <div className="catalog-page-heading">
        <div>
          <span className="admin-eyebrow">CATALOG MANAGEMENT</span>
          <h2>Quản lý {config.title.toLowerCase()}</h2>
          <p>
            Quản lý thông tin, trạng thái và dữ liệu {config.singular} của cửa
            hàng.
          </p>
        </div>

        <button className="catalog-primary-button" onClick={openCreateModal}>
          <span>＋</span> Thêm {config.singular}
        </button>
      </div>

      {error && (
        <div className="admin-alert admin-alert-error" role="alert">
          {error}
        </div>
      )}

      {notice && (
        <div className="catalog-notice" role="status">
          {notice}
          <button onClick={() => setNotice("")} aria-label="Đóng thông báo">
            ×
          </button>
        </div>
      )}

      <div className="catalog-toolbar">
        <form className="catalog-search" onSubmit={submitSearch}>
          <span aria-hidden="true">⌕</span>
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={`Tìm ${config.singular}...`}
            aria-label={`Tìm ${config.singular}`}
          />
          <button type="submit">Tìm kiếm</button>
        </form>

        <select
          className="catalog-status-filter"
          value={status}
          onChange={(event) => changeStatus(event.target.value)}
          aria-label="Lọc trạng thái"
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="true">Đang hoạt động</option>
          <option value="false">Ngừng hoạt động</option>
        </select>
      </div>

      <div className="catalog-table-card">
        <div className="catalog-table-heading">
          <div>
            <h3>Danh sách {config.title.toLowerCase()}</h3>
            <span>{pagination.total} mục</span>
          </div>
          <button
            className="catalog-refresh-button"
            onClick={loadItems}
            disabled={loading}
          >
            ↻ Làm mới
          </button>
        </div>

        <div className="catalog-table-scroll">
          <table className="catalog-table">
            <thead>
              <tr>
                <th>{config.nameLabel}</th>
                <th>Slug</th>
                <th>{config.countLabel}</th>
                <th>Trạng thái</th>
                {type === "categories" && <th>Thứ tự</th>}
                <th className="catalog-actions-heading">Thao tác</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={type === "categories" ? 6 : 5}>
                    <div className="catalog-table-state">
                      <span className="catalog-spinner" />
                      Đang tải dữ liệu...
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={type === "categories" ? 6 : 5}>
                    <div className="catalog-table-state">
                      <strong>Chưa có dữ liệu</strong>
                      <span>
                        Không tìm thấy {config.singular} phù hợp.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="catalog-name-cell">
                        {item[config.imageField] ? (
                          <img
                            src={item[config.imageField]}
                            alt=""
                            className="catalog-item-image"
                            onError={(event) => {
                              event.currentTarget.style.visibility = "hidden";
                            }}
                          />
                        ) : (
                          <span className="catalog-item-placeholder">
                            {item.name?.charAt(0)?.toUpperCase() || "?"}
                          </span>
                        )}
                        <div>
                          <strong>{item.name}</strong>
                          <small>{item.description || "Chưa có mô tả"}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <code className="catalog-slug">{item.slug}</code>
                    </td>
                    <td>
                      <span className="catalog-product-count">
                        {getProductCount(item)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`catalog-status ${item.isActive ? "is-active" : "is-inactive"
                          }`}
                      >
                        {item.isActive ? "Hoạt động" : "Đã ẩn"}
                      </span>
                    </td>
                    {type === "categories" && (
                      <td>{item.sortOrder ?? 0}</td>
                    )}
                    <td>
                      <div className="catalog-row-actions">
                        <button onClick={() => openEditModal(item)}>
                          Sửa
                        </button>
                        <button
                          className="is-danger"
                          onClick={() => handleDelete(item)}
                          disabled={deletingId === item.id}
                        >
                          {deletingId === item.id ? "Đang xử lý..." : "Xóa"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="catalog-pagination">
          <span>
            Hiển thị {start}–{end} trong {pagination.total} mục
          </span>
          <div>
            <button
              onClick={() =>
                setPagination((current) => ({
                  ...current,
                  page: Math.max(1, current.page - 1),
                }))
              }
              disabled={loading || pagination.page <= 1}
            >
              ← Trước
            </button>
            <span>
              Trang {pagination.page} / {Math.max(1, pageCount)}
            </span>
            <button
              onClick={() =>
                setPagination((current) => ({
                  ...current,
                  page: Math.min(pageCount, current.page + 1),
                }))
              }
              disabled={loading || pageCount === 0 || pagination.page >= pageCount}
            >
              Sau →
            </button>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div
          className="catalog-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <section
            className="catalog-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="catalog-modal-title"
          >
            <div className="catalog-modal-heading">
              <div>
                <span className="admin-eyebrow">
                  {editingItem ? "UPDATE INFORMATION" : "CREATE NEW"}
                </span>
                <h3 id="catalog-modal-title">
                  {editingItem
                    ? `Chỉnh sửa ${config.singular}`
                    : `Thêm ${config.singular}`}
                </h3>
              </div>
              <button
                className="catalog-modal-close"
                onClick={closeModal}
                disabled={saving || imageUploading}
                aria-label="Đóng"
              >
                ×
              </button>
            </div>


            <form onSubmit={handleSubmit}>
              <label className="catalog-form-field">
                <span>{config.nameLabel}</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  maxLength={160}
                  required
                  placeholder={`Nhập ${config.nameLabel.toLowerCase()}...`}
                />
              </label>

              <label className="catalog-form-field">
                <span>Slug</span>
                <input
                  value={form.slug}
                  onChange={(event) => updateForm("slug", event.target.value)}
                  maxLength={160}
                  placeholder="Để trống để tự tạo từ tên"
                />
              </label>

              <label className="catalog-form-field">
                <span>Mô tả</span>
                <textarea
                  value={form.description}
                  onChange={(event) => updateForm("description", event.target.value)}
                  maxLength={5000}
                  rows={3}
                  placeholder="Nhập mô tả..."
                />
              </label>

              <div className="catalog-form-field">
                <span>{config.imageLabel}</span>

                <div className="catalog-image-upload">
                  <label className="catalog-upload-button">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleImageSelect}
                      disabled={saving || imageUploading}
                    />
                    {imageUploading ? "Đang tải ảnh..." : "＋ Chọn ảnh từ máy"}
                  </label>

                  <span className="catalog-upload-hint">
                    JPG, PNG hoặc WebP · Tối đa 5MB
                  </span>

                  {imageUploading && (
                    <div className="catalog-upload-progress">
                      <span className="catalog-spinner" />
                      Đang tải ảnh lên Cloudinary...
                    </div>
                  )}

                  {imagePreview && (
                    <div className="catalog-image-preview">
                      <img src={imagePreview} alt="Xem trước ảnh" />

                      <button
                        type="button"
                        onClick={() => {
                          updateForm(config.imageField, "");
                          setImagePreview("");
                        }}
                        disabled={saving || imageUploading}
                      >
                        Xóa ảnh
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {type === "categories" && (
                <label className="catalog-form-field">
                  <span>Thứ tự hiển thị</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.sortOrder}
                    onChange={(event) => updateForm("sortOrder", event.target.value)}
                  />
                </label>
              )}

              <label className="catalog-checkbox-field">
                <input
                  type="checkbox"
                  checked={Boolean(form.isActive)}
                  onChange={(event) => updateForm("isActive", event.target.checked)}
                />
                <span>Đang hoạt động</span>
              </label>

              <div className="catalog-modal-actions">
                <button
                  type="button"
                  className="catalog-secondary-button"
                  onClick={closeModal}
                  disabled={saving || imageUploading}
                >
                  Hủy
                </button>

                <button
                  type="submit"
                  className="catalog-primary-button"
                  disabled={saving || imageUploading}
                >
                  {saving
                    ? "Đang lưu..."
                    : editingItem
                      ? "Lưu thay đổi"
                      : "Tạo mới"}
                </button>
              </div>
            </form>

          </section>
        </div>
      )}
    </section>
  );
}
