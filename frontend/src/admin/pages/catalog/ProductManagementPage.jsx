
import { useCallback, useEffect, useState } from "react";
import { catalogRequest } from "../../services/admin-catalog.service.js";
import { productService } from "../../services/admin-product.service.js";

const INITIAL_VARIANT = {
  name: "",
  sku: "",
  color: "",
  weightGrams: "",
  images: [],
};

const INITIAL_FORM = {
  name: "",
  slug: "",
  description: "",
  categoryId: "",
  brandId: "",
  price: "",
  status: "DRAFT",
  isFeatured: false,
  variants: [{ ...INITIAL_VARIANT }],
  images: [],
};

function formatPrice(value) {
  if (value == null) return "—";

  return `${Number(value).toLocaleString("vi-VN")} ₫`;
}

function getErrorMessage(error) {
  return error?.message || "Đã xảy ra lỗi.";
}

function normalizeProduct(product) {
  return {
    name: product.name || "",
    slug: product.slug || "",
    description: product.description || "",
    categoryId: product.categoryId || "",
    brandId: product.brandId || "",
    price: product.price ?? "",
    status: product.status || "DRAFT",
    isFeatured: Boolean(product.isFeatured),
    variants: [],
    images: (product.images || []).map((image) => ({ ...image })),
  };
}

function normalizeVariant(variant) {
  return {
    name: variant.name || "",
    sku: variant.sku || "",
    color: variant.attributes?.color || "",
    weightGrams: variant.weightGrams ?? "",
    images: (variant.images || []).map((image) => ({ ...image })),
  };
}

function serializeImages(images = []) {
  return images.map((image, index) => ({
    imageUrl: image.imageUrl,
    publicId: image.publicId ?? null,
    altText: image.altText ?? null,
    sortOrder: index,
    isPrimary: Boolean(image.isPrimary),
  }));
}

function ImageGroupEditor({
  title,
  images = [],
  onChange,
  onUpload,
  disabled = false,
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  async function handleFiles(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (files.length === 0) return;

    setUploading(true);
    setUploadError("");

    try {
      const uploaded = await onUpload(files);

      const nextImages = [
        ...images,
        ...uploaded.map((image, index) => ({
          imageUrl: image.url,
          publicId: image.publicId,
          altText: "",
          sortOrder: images.length + index,
          isPrimary: images.length === 0 && index === 0,
        })),
      ];

      onChange(nextImages);
    } catch (error) {
      setUploadError(error.message || "Không thể tải ảnh lên.");
    } finally {
      setUploading(false);
    }
  }

  function setPrimary(index) {
    onChange(
      images.map((image, i) => ({
        ...image,
        isPrimary: i === index,
      }))
    );
  }

  function removeImage(index) {
    const nextImages = images
      .filter((_, i) => i !== index)
      .map((image, i) => ({
        ...image,
        sortOrder: i,
        isPrimary: false,
      }));

    if (nextImages.length > 0) {
      const previousPrimaryIndex = images.findIndex(
        (image) => image.isPrimary
      );

      const nextPrimaryIndex =
        previousPrimaryIndex === index
          ? Math.min(index, nextImages.length - 1)
          : previousPrimaryIndex > index
            ? previousPrimaryIndex - 1
            : previousPrimaryIndex;

      nextImages[nextPrimaryIndex].isPrimary = true;
    }

    onChange(nextImages);
  }

  function moveImage(index, direction) {
    const targetIndex = index + direction;

    if (targetIndex < 0 || targetIndex >= images.length) return;

    const nextImages = [...images];

    [nextImages[index], nextImages[targetIndex]] = [
      nextImages[targetIndex],
      nextImages[index],
    ];

    onChange(
      nextImages.map((image, i) => ({
        ...image,
        sortOrder: i,
      }))
    );
  }

  return (
    <div className="product-image-group">
      <div className="product-section-heading">
        <h4>{title}</h4>
        <span>{images.length} ảnh</span>
      </div>

      <label className="product-image-upload">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={disabled || uploading}
          onChange={handleFiles}
        />

        <span>
          {uploading ? "Đang tải ảnh..." : "＋ Chọn ảnh"}
        </span>

        <small>JPG, PNG hoặc WEBP · Tối đa 5MB/ảnh</small>
      </label>

      {uploadError && (
        <div className="admin-alert admin-alert-error" role="alert">
          {uploadError}
        </div>
      )}

      {images.length > 0 && (
        <div className="product-image-grid">
          {images.map((image, index) => (
            <div className="product-image-card" key={`${image.publicId || image.imageUrl}-${index}`}>
              <img
                src={image.imageUrl}
                alt={image.altText || `${title} ${index + 1}`}
              />

              {image.isPrimary && (
                <span className="product-image-primary">
                  Ảnh chính
                </span>
              )}

              <div className="product-image-actions">
                <button
                  type="button"
                  disabled={disabled || image.isPrimary}
                  onClick={() => setPrimary(index)}
                >
                  Chọn ảnh chính
                </button>

                <button
                  type="button"
                  disabled={disabled || index === 0}
                  onClick={() => moveImage(index, -1)}
                  aria-label="Di chuyển ảnh lên"
                >
                  ↑
                </button>

                <button
                  type="button"
                  disabled={disabled || index === images.length - 1}
                  onClick={() => moveImage(index, 1)}
                  aria-label="Di chuyển ảnh xuống"
                >
                  ↓
                </button>

                <button
                  type="button"
                  className="product-text-danger"
                  disabled={disabled}
                  onClick={() => removeImage(index)}
                >
                  Xóa
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProductManagementPage({
  accessToken,
  onSessionUpdate,
  onSessionExpired,
}) {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);

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
  const [form, setForm] = useState({ ...INITIAL_FORM });

  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [variantForms, setVariantForms] = useState({});
  const [newVariant, setNewVariant] = useState({ ...INITIAL_VARIANT });
  const [variantSaving, setVariantSaving] = useState(false);

  const loadOptions = useCallback(async () => {
    try {
      const [categoryResult, brandResult] = await Promise.all([
        catalogRequest(
          "/categories?page=1&limit=100&isActive=true",
          {},
          accessToken,
          onSessionUpdate
        ),
        catalogRequest(
          "/brands?page=1&limit=100&isActive=true",
          {},
          accessToken,
          onSessionUpdate
        ),
      ]);

      setCategories(categoryResult.items || []);
      setBrands(brandResult.items || []);
    } catch (err) {
      setError(getErrorMessage(err));

      if (err.message?.includes("Phiên đăng nhập đã hết hạn")) {
        onSessionExpired?.();
      }
    }
  }, [accessToken, onSessionUpdate, onSessionExpired]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = {
        page: String(pagination.page),
        limit: String(pagination.limit),
      };

      if (search.trim()) params.search = search.trim();
      if (status !== "all") params.status = status;

      const result = await productService.list(
        params,
        accessToken,
        onSessionUpdate
      );

      setItems(Array.isArray(result.items) ? result.items : []);

      setPagination((current) => ({
        ...current,
        ...(result.pagination || {}),
      }));
    } catch (err) {
      setError(getErrorMessage(err));

      if (err.message?.includes("Phiên đăng nhập đã hết hạn")) {
        onSessionExpired?.();
      }
    } finally {
      setLoading(false);
    }
  }, [
    accessToken,
    onSessionUpdate,
    onSessionExpired,
    pagination.page,
    pagination.limit,
    search,
    status,
  ]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateVariant(index, field, value) {
    setForm((current) => ({
      ...current,
      variants: current.variants.map((variant, i) =>
        i === index ? { ...variant, [field]: value } : variant
      ),
    }));
  }

  function addVariantField() {
    setForm((current) => ({
      ...current,
      variants: [
        ...current.variants,
        { ...INITIAL_VARIANT },
      ],
    }));
  }

  function removeVariantField(index) {
    setForm((current) => ({
      ...current,
      variants: current.variants.filter((_, i) => i !== index),
    }));
  }

  function openCreateModal() {
    setEditingItem(null);
    setForm({
      ...INITIAL_FORM,
      variants: [{ ...INITIAL_VARIANT }],
    });
    setVariantForms({});
    setNewVariant({ ...INITIAL_VARIANT });
    setError("");
    setNotice("");
    setModalOpen(true);
  }

  async function openEditModal(item) {
    setError("");
    setNotice("");
    setLoading(true);

    try {
      const result = await productService.getById(
        item.id,
        accessToken,
        onSessionUpdate
      );

      const product = result.item || result.data || result;

      setEditingItem(product);
      setForm(normalizeProduct(product));

      const initialVariantForms = {};

      for (const variant of product.variants || []) {
        initialVariantForms[variant.id] = normalizeVariant(variant);
      }

      setVariantForms(initialVariantForms);
      setNewVariant({ ...INITIAL_VARIANT });
      setModalOpen(true);
    } catch (err) {
      setError(getErrorMessage(err));

      if (err.message?.includes("Phiên đăng nhập đã hết hạn")) {
        onSessionExpired?.();
      }
    } finally {
      setLoading(false);
    }
  }

  function closeModal() {
    if (saving || variantSaving) return;

    setModalOpen(false);
    setEditingItem(null);
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
      categoryId: form.categoryId,
      brandId: form.brandId || null,
      price: Number(form.price),
      status: form.status,
      isFeatured: Boolean(form.isFeatured),
      images: serializeImages(form.images),
    };

    if (!editingItem) {
      payload.variants = form.variants.map((variant) => ({
        name: variant.name.trim(),
        sku: variant.sku.trim().toUpperCase(),
        attributes: {
          color: variant.color.trim(),
        },
        weightGrams: variant.weightGrams
          ? Number(variant.weightGrams)
          : null,
        images: serializeImages(variant.images),
      }));
    } else {
      payload.variantImages = (editingItem.variants || []).map((variant) => ({
        variantId: variant.id,
        images: serializeImages(variantForms[variant.id]?.images),
      }));
    }

    try {
      if (editingItem) {
        await productService.update(
          editingItem.id,
          payload,
          accessToken,
          onSessionUpdate
        );
        setNotice("Đã cập nhật sản phẩm.");
      } else {
        await productService.create(
          payload,
          accessToken,
          onSessionUpdate
        );
        setNotice("Đã tạo sản phẩm mới.");
      }

      setModalOpen(false);
      setEditingItem(null);

      setPagination((current) => ({
        ...current,
        page: 1,
      }));

      if (pagination.page === 1) {
        await loadProducts();
      }
    } catch (err) {
      setError(getErrorMessage(err));

      if (err.message?.includes("Phiên đăng nhập đã hết hạn")) {
        onSessionExpired?.();
      }
    } finally {
      setSaving(false);
    }
  }


  async function handleAddVariant() {
    if (!editingItem || variantSaving) return;

    // Kiểm tra các trường bắt buộc của Variant mới
    if (
      !newVariant.name.trim() ||
      !newVariant.sku.trim() ||
      !newVariant.color.trim()
    ) {
      setError("Vui lòng nhập đầy đủ tên biến thể, SKU và màu sắc.");
      return;
    }

    setVariantSaving(true);
    setError("");

    const payload = {
      name: newVariant.name.trim(),
      sku: newVariant.sku.trim().toUpperCase(),
      attributes: {
        color: newVariant.color.trim(),
      },
      weightGrams: newVariant.weightGrams
        ? Number(newVariant.weightGrams)
        : null,
    };

    try {
      await productService.addVariant(
        editingItem.id,
        payload,
        accessToken,
        onSessionUpdate
      );

      const result = await productService.getById(
        editingItem.id,
        accessToken,
        onSessionUpdate
      );

      const product = result.item || result.data || result;

      setEditingItem(product);

      const updatedForms = {};

      for (const variant of product.variants || []) {
        updatedForms[variant.id] = normalizeVariant(variant);
      }

      setVariantForms(updatedForms);
      setNewVariant({ ...INITIAL_VARIANT });
      setNotice("Đã thêm Variant.");
      await loadProducts();
    } catch (err) {
      setError(getErrorMessage(err));

      if (err.message?.includes("Phiên đăng nhập đã hết hạn")) {
        onSessionExpired?.();
      }
    } finally {
      setVariantSaving(false);
    }
  }


  async function handleUpdateVariant(variantId) {
    if (!editingItem || variantSaving) return;

    const variant = variantForms[variantId];

    if (!variant) return;

    setVariantSaving(true);
    setError("");

    const payload = {
      name: variant.name.trim(),
      sku: variant.sku.trim().toUpperCase(),
      attributes: {
        color: variant.color.trim(),
      },
      weightGrams: variant.weightGrams
        ? Number(variant.weightGrams)
        : null,
    };

    try {
      await productService.updateVariant(
        editingItem.id,
        variantId,
        payload,
        accessToken,
        onSessionUpdate
      );

      setNotice("Đã cập nhật Variant.");
      await loadProducts();
    } catch (err) {
      setError(getErrorMessage(err));

      if (err.message?.includes("Phiên đăng nhập đã hết hạn")) {
        onSessionExpired?.();
      }
    } finally {
      setVariantSaving(false);
    }
  }

  async function uploadImages(type, files) {
    const results = await Promise.all(
      files.map((file) =>
        productService.uploadImage(
          type,
          file,
          accessToken,
          onSessionUpdate
        )
      )
    );

    return results.map((result) => {
      const data = result.data || result;

      return {
        url: data.url,
        publicId: data.publicId,
      };
    });
  }

  async function handleDeactivateVariant(variant) {
    if (!editingItem || variantSaving) return;

    const confirmed = window.confirm(
      `Bạn có chắc muốn ngừng Variant "${variant.name}"?`
    );

    if (!confirmed) return;

    setVariantSaving(true);
    setError("");

    try {
      await productService.deactivateVariant(
        editingItem.id,
        variant.id,
        accessToken,
        onSessionUpdate
      );

      const result = await productService.getById(
        editingItem.id,
        accessToken,
        onSessionUpdate
      );

      const product = result.item || result.data || result;

      setEditingItem(product);

      const updatedForms = {};

      for (const item of product.variants || []) {
        updatedForms[item.id] = normalizeVariant(item);
      }

      setVariantForms(updatedForms);
      setNotice("Đã ngừng Variant.");
      await loadProducts();
    } catch (err) {
      setError(getErrorMessage(err));

      if (err.message?.includes("Phiên đăng nhập đã hết hạn")) {
        onSessionExpired?.();
      }
    } finally {
      setVariantSaving(false);
    }
  }

  async function handleArchive(item) {
    if (deletingId) return;

    const confirmed = window.confirm(
      `Bạn có chắc muốn lưu trữ sản phẩm "${item.name}"?`
    );

    if (!confirmed) return;

    setDeletingId(item.id);
    setError("");
    setNotice("");

    try {
      await productService.archive(
        item.id,
        accessToken,
        onSessionUpdate
      );

      setNotice("Đã lưu trữ sản phẩm.");
      await loadProducts();
    } catch (err) {
      setError(getErrorMessage(err));

      if (err.message?.includes("Phiên đăng nhập đã hết hạn")) {
        onSessionExpired?.();
      }
    } finally {
      setDeletingId(null);
    }
  }

  function submitSearch(event) {
    event.preventDefault();

    setPagination((current) => ({
      ...current,
      page: 1,
    }));

    setSearch(searchInput.trim());
  }

  function changeStatus(value) {
    setStatus(value);

    setPagination((current) => ({
      ...current,
      page: 1,
    }));
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

  return (
    <section className="catalog-page">
      <div className="catalog-page-heading">
        <div>
          <span className="admin-eyebrow">
            CATALOG MANAGEMENT
          </span>
          <h2>Quản lý sản phẩm</h2>
          <p>
            Quản lý thông tin, giá bán, hình thức kinh doanh
            và các biến thể sản phẩm.
          </p>
        </div>

        <button
          className="catalog-primary-button"
          onClick={openCreateModal}
        >
          <span>＋</span> Thêm sản phẩm
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
          <button
            onClick={() => setNotice("")}
            aria-label="Đóng thông báo"
          >
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
            placeholder="Tìm theo tên sản phẩm hoặc SKU..."
            aria-label="Tìm sản phẩm"
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
          <option value="DRAFT">Bản nháp</option>
          <option value="ACTIVE">Đang bán</option>
          <option value="ARCHIVED">Đã lưu trữ</option>
        </select>
      </div>

      <div className="catalog-table-card">
        <div className="catalog-table-scroll">
          <table className="catalog-table">
            <thead>
              <tr>
                <th>Sản phẩm</th>
                <th>Danh mục</th>
                <th>Thương hiệu</th>
                <th>Giá bán</th>
                <th>Variants</th>
                <th>Tồn khả dụng</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8">
                    <div className="catalog-table-state">
                      <span className="catalog-spinner" />
                      Đang tải dữ liệu...
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan="8">
                    <div className="catalog-table-state">
                      Chưa có sản phẩm nào.
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="catalog-name-cell">
                        {item.primaryImage ? (
                          <img
                            className="catalog-item-image"
                            src={item.primaryImage?.imageUrl || item.primaryImage}
                            alt={item.primaryImage?.altText || item.name}
                          />
                        ) : (
                          <div className="catalog-item-image">
                            <span>Ảnh</span>
                          </div>
                        )}

                        <div>
                          <strong>{item.name}</strong>
                          <small>{item.slug}</small>
                        </div>
                      </div>
                    </td>

                    <td>{item.category?.name || "—"}</td>
                    <td>{item.brand?.name || "—"}</td>
                    <td>{formatPrice(item.price)}</td>
                    <td>{item.variantCount ?? 0}</td>
                    <td>{item.totalStock ?? 0}</td>

                    <td>
                      <span
                        className={`catalog-status ${item.status === "ACTIVE"
                          ? "is-active"
                          : item.status === "ARCHIVED"
                            ? "is-inactive"
                            : ""
                          }`}
                      >
                        {item.status === "ACTIVE"
                          ? "Đang bán"
                          : item.status === "ARCHIVED"
                            ? "Đã lưu trữ"
                            : "Bản nháp"}
                      </span>
                    </td>

                    <td>
                      <div className="catalog-row-actions">
                        <button onClick={() => openEditModal(item)}>
                          Sửa
                        </button>

                        {item.status !== "ARCHIVED" && (
                          <button
                            className="is-danger"
                            onClick={() => handleArchive(item)}
                            disabled={deletingId === item.id}
                          >
                            {deletingId === item.id
                              ? "Đang lưu..."
                              : "Lưu trữ"}
                          </button>
                        )}
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
            Hiển thị {start}–{end} trên {pagination.total} sản phẩm
          </span>

          <div>
            <button
              disabled={pagination.page <= 1 || loading}
              onClick={() =>
                setPagination((current) => ({
                  ...current,
                  page: current.page - 1,
                }))
              }
            >
              Trước
            </button>

            <strong>
              {pagination.page} / {pageCount || 1}
            </strong>

            <button
              disabled={
                pagination.page >= pageCount || loading
              }
              onClick={() =>
                setPagination((current) => ({
                  ...current,
                  page: current.page + 1,
                }))
              }
            >
              Sau
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
          <div className="catalog-modal product-modal">
            <div className="catalog-modal-header">
              <div>
                <span className="admin-eyebrow">
                  PRODUCT MANAGEMENT
                </span>

                <h2>
                  {editingItem
                    ? "Chỉnh sửa sản phẩm"
                    : "Thêm sản phẩm mới"}
                </h2>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={saving || variantSaving}
                aria-label="Đóng"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="product-form-section">
                <h3>Thông tin chung</h3>

                <div className="product-form-section">
                  <ImageGroupEditor
                    title="Ảnh sản phẩm"
                    images={form.images}
                    disabled={saving}
                    onUpload={(files) => uploadImages("product", files)}
                    onChange={(images) => updateForm("images", images)}
                  />
                </div>

                <label className="catalog-form-field">
                  <span>Tên sản phẩm *</span>
                  <input
                    value={form.name}
                    onChange={(event) =>
                      updateForm("name", event.target.value)
                    }
                    maxLength={160}
                    required
                  />
                </label>

                <label className="catalog-form-field">
                  <span>Slug</span>
                  <input
                    value={form.slug}
                    onChange={(event) =>
                      updateForm("slug", event.target.value)
                    }
                    maxLength={160}
                    placeholder="Để trống để tự tạo từ tên"
                  />
                </label>

                <div className="product-form-grid">
                  <label className="catalog-form-field">
                    <span>Danh mục *</span>
                    <select
                      value={form.categoryId}
                      onChange={(event) =>
                        updateForm("categoryId", event.target.value)
                      }
                      required
                    >
                      <option value="">Chọn danh mục</option>

                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="catalog-form-field">
                    <span>Thương hiệu</span>
                    <select
                      value={form.brandId}
                      onChange={(event) =>
                        updateForm("brandId", event.target.value)
                      }
                    >
                      <option value="">Không chọn</option>

                      {brands.map((brand) => (
                        <option key={brand.id} value={brand.id}>
                          {brand.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="catalog-form-field">
                  <span>Giá bán (VNĐ) *</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.price}
                    onChange={(event) =>
                      updateForm("price", event.target.value)
                    }
                    required
                  />
                </label>

                <label className="catalog-form-field">
                  <span>Mô tả</span>
                  <textarea
                    rows={4}
                    maxLength={5000}
                    value={form.description}
                    onChange={(event) =>
                      updateForm("description", event.target.value)
                    }
                  />
                </label>
              </div>

              {!editingItem && (
                <div className="product-form-section">
                  <div className="product-section-heading">
                    <h3>Biến thể sản phẩm</h3>

                    <button
                      type="button"
                      className="catalog-secondary-button"
                      onClick={addVariantField}
                    >
                      ＋ Thêm Variant
                    </button>
                  </div>

                  {form.variants.map((variant, index) => (
                    <div className="product-variant-card" key={index}>
                      <div className="product-section-heading">
                        <strong>Variant {index + 1}</strong>

                        {form.variants.length > 1 && (
                          <button
                            type="button"
                            className="product-text-danger"
                            onClick={() => removeVariantField(index)}
                          >
                            Xóa
                          </button>
                        )}
                      </div>

                      <label className="catalog-form-field">
                        <span>Tên biến thể *</span>
                        <input
                          value={variant.name}
                          onChange={(event) =>
                            updateVariant(index, "name", event.target.value)
                          }
                          required
                        />
                      </label>

                      <label className="catalog-form-field">
                        <span>SKU *</span>
                        <input
                          value={variant.sku}
                          onChange={(event) =>
                            updateVariant(index, "sku", event.target.value)
                          }
                          required
                        />
                      </label>

                      <div className="product-form-grid">
                        <label className="catalog-form-field">
                          <span>Màu sắc *</span>
                          <input
                            value={variant.color}
                            onChange={(event) =>
                              updateVariant(index, "color", event.target.value)
                            }
                            required
                          />
                        </label>

                        <label className="catalog-form-field">
                          <span>Trọng lượng (gram)</span>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={variant.weightGrams}
                            onChange={(event) =>
                              updateVariant(
                                index,
                                "weightGrams",
                                event.target.value
                              )
                            }
                          />
                        </label>

                        <ImageGroupEditor
                          title={`Ảnh Variant ${index + 1}`}
                          images={variant.images || []}
                          disabled={saving}
                          onUpload={(files) => uploadImages("variant", files)}
                          onChange={(images) => updateVariant(index, "images", images)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {editingItem && (
                <div className="product-form-section">
                  <h3>Quản lý Variants</h3>

                  {(editingItem.variants || []).map((variant) => {
                    const values = variantForms[variant.id] || {};

                    return (
                      <div className="product-variant-card" key={variant.id}>
                        <div className="product-section-heading">
                          <strong>{variant.name}</strong>

                          <span>
                            {variant.isActive
                              ? "Đang hoạt động"
                              : "Đã ngừng"}
                          </span>
                        </div>

                        <label className="catalog-form-field">
                          <span>Tên biến thể</span>
                          <input
                            value={values.name || ""}
                            disabled={!variant.isActive}
                            onChange={(event) =>
                              setVariantForms((current) => ({
                                ...current,
                                [variant.id]: {
                                  ...current[variant.id],
                                  name: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>

                        <label className="catalog-form-field">
                          <span>SKU</span>
                          <input
                            value={values.sku || ""}
                            disabled={!variant.isActive}
                            onChange={(event) =>
                              setVariantForms((current) => ({
                                ...current,
                                [variant.id]: {
                                  ...current[variant.id],
                                  sku: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>

                        <div className="product-form-grid">
                          <label className="catalog-form-field">
                            <span>Màu sắc</span>
                            <input
                              value={values.color || ""}
                              disabled={!variant.isActive}
                              onChange={(event) =>
                                setVariantForms((current) => ({
                                  ...current,
                                  [variant.id]: {
                                    ...current[variant.id],
                                    color: event.target.value,
                                  },
                                }))
                              }
                            />
                          </label>

                          <label className="catalog-form-field">
                            <span>Trọng lượng (gram)</span>
                            <input
                              type="number"
                              min="1"
                              value={values.weightGrams ?? ""}
                              disabled={!variant.isActive}
                              onChange={(event) =>
                                setVariantForms((current) => ({
                                  ...current,
                                  [variant.id]: {
                                    ...current[variant.id],
                                    weightGrams: event.target.value,
                                  },
                                }))
                              }
                            />
                          </label>
                        </div>

                        <ImageGroupEditor
                          title={`Ảnh Variant: ${variant.name}`}
                          images={values.images || []}
                          disabled={saving || variantSaving || !variant.isActive}
                          onUpload={(files) => uploadImages("variant", files)}
                          onChange={(images) =>
                            setVariantForms((current) => ({
                              ...current,
                              [variant.id]: {
                                ...current[variant.id],
                                images,
                              },
                            }))
                          }
                        />

                        {variant.isActive && (
                          <div className="product-variant-actions">
                            <button
                              type="button"
                              className="catalog-secondary-button"
                              disabled={variantSaving}
                              onClick={() =>
                                handleUpdateVariant(variant.id)
                              }
                            >
                              Lưu Variant
                            </button>

                            <button
                              type="button"
                              className="product-text-danger"
                              disabled={variantSaving}
                              onClick={() =>
                                handleDeactivateVariant(variant)
                              }
                            >
                              Ngừng hoạt động
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div className="product-variant-card">
                    <strong>Thêm Variant mới</strong>

                    <label className="catalog-form-field">
                      <span>Tên biến thể *</span>
                      <input
                        value={newVariant.name}
                        onChange={(event) =>
                          setNewVariant((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }

                      />
                    </label>

                    <label className="catalog-form-field">
                      <span>SKU *</span>
                      <input
                        value={newVariant.sku}
                        onChange={(event) =>
                          setNewVariant((current) => ({
                            ...current,
                            sku: event.target.value,
                          }))
                        }

                      />
                    </label>

                    <div className="product-form-grid">
                      <label className="catalog-form-field">
                        <span>Màu sắc *</span>
                        <input
                          value={newVariant.color}
                          onChange={(event) =>
                            setNewVariant((current) => ({
                              ...current,
                              color: event.target.value,
                            }))
                          }

                        />
                      </label>

                      <label className="catalog-form-field">
                        <span>Trọng lượng (gram)</span>
                        <input
                          type="number"
                          min="1"
                          value={newVariant.weightGrams}
                          onChange={(event) =>
                            setNewVariant((current) => ({
                              ...current,
                              weightGrams: event.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>

                    <button
                      type="button"
                      className="catalog-secondary-button"
                      disabled={variantSaving}
                      onClick={handleAddVariant}
                    >
                      {variantSaving ? "Đang thêm..." : "Thêm Variant"}
                    </button>
                  </div>
                </div>
              )}

              <div className="product-form-section">
                <h3>Trạng thái và hiển thị</h3>

                <label className="catalog-form-field">
                  <span>Trạng thái sản phẩm</span>
                  <select
                    value={form.status}
                    onChange={(event) =>
                      updateForm("status", event.target.value)
                    }
                    disabled={editingItem?.status === "ARCHIVED"}
                  >
                    <option value="DRAFT">Bản nháp</option>
                    <option value="ACTIVE">Đang bán</option>
                  </select>
                </label>

                <label className="catalog-checkbox-field">
                  <input
                    type="checkbox"
                    checked={form.isFeatured}
                    onChange={(event) =>
                      updateForm("isFeatured", event.target.checked)
                    }
                  />
                  <span>Sản phẩm nổi bật</span>
                </label>
              </div>

              <div className="catalog-modal-actions">
                <button
                  type="button"
                  className="catalog-secondary-button"
                  onClick={closeModal}
                  disabled={saving || variantSaving}
                >
                  Hủy
                </button>

                <button
                  type="submit"
                  className="catalog-primary-button"
                  disabled={saving || variantSaving}
                >
                  {saving
                    ? "Đang lưu..."
                    : editingItem
                      ? "Lưu thay đổi"
                      : "Tạo sản phẩm"}
                </button>
              </div>
            </form>
          </div>
        </div >
      )
      }
    </section >
  );
}
