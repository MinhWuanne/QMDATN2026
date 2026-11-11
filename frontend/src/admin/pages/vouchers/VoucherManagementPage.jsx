
import { useCallback, useEffect, useMemo, useState } from "react";
import { voucherRequest } from "../../services/admin-voucher.service.js";

const PAGE_SIZE = 20;

const EMPTY_FORM = {
  code: "",
  description: "",
  discountType: "PERCENTAGE",
  discountValue: "",
  maxDiscount: "",
  minOrderAmount: "0",
  usageLimit: "",
  perUserLimit: "1",
  startsAt: "",
  endsAt: "",
  isActive: true,
};

function toLocalDateTime(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset)
    .toISOString()
    .slice(0, 16);
}

function toIsoDate(value) {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeVoucher(voucher) {
  if (!voucher) return voucher;

  return {
    ...voucher,
    usageCount: voucher.usageCount ?? voucher._count?.usages ?? 0,
    orderCount: voucher.orderCount ?? voucher._count?.orders ?? 0,
  };
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatMoney(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return "—";

  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 2,
  }).format(number) + " ₫";
}

function formatDiscount(voucher) {
  if (voucher.discountType === "PERCENTAGE") {
    return `${Number(voucher.discountValue)}%`;
  }

  return formatMoney(voucher.discountValue);
}

function getVoucherStatus(voucher) {
  const now = Date.now();
  const startsAt = new Date(voucher.startsAt).getTime();
  const endsAt = new Date(voucher.endsAt).getTime();

  if (!voucher.isActive) {
    return { label: "Đã tắt", type: "inactive" };
  }

  if (now < startsAt) {
    return { label: "Chưa bắt đầu", type: "upcoming" };
  }

  if (now > endsAt) {
    return { label: "Đã hết hạn", type: "expired" };
  }

  if (
    voucher.usageLimit !== null &&
    voucher.usageLimit !== undefined &&
    voucher.usageCount >= voucher.usageLimit
  ) {
    return { label: "Đã hết lượt", type: "expired" };
  }

  return { label: "Đang hoạt động", type: "active" };
}

function buildForm(voucher) {
  if (!voucher) {
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + 30);

    return {
      ...EMPTY_FORM,
      startsAt: toLocalDateTime(now),
      endsAt: toLocalDateTime(end),
    };
  }

  return {
    code: voucher.code ?? "",
    description: voucher.description ?? "",
    discountType: voucher.discountType ?? "PERCENTAGE",
    discountValue: String(voucher.discountValue ?? ""),
    maxDiscount:
      voucher.maxDiscount === null || voucher.maxDiscount === undefined
        ? ""
        : String(voucher.maxDiscount),
    minOrderAmount: String(voucher.minOrderAmount ?? 0),
    usageLimit:
      voucher.usageLimit === null || voucher.usageLimit === undefined
        ? ""
        : String(voucher.usageLimit),
    perUserLimit: String(voucher.perUserLimit ?? 1),
    startsAt: toLocalDateTime(voucher.startsAt),
    endsAt: toLocalDateTime(voucher.endsAt),
    isActive: Boolean(voucher.isActive),
  };
}

function toPayload(form, isCreate) {
  const payload = {
    description: form.description.trim() || null,
    startsAt: toIsoDate(form.startsAt),
    endsAt: toIsoDate(form.endsAt),
    isActive: form.isActive,
    usageLimit:
      form.usageLimit.trim() === "" ? null : Number(form.usageLimit),
  };

  if (isCreate) {
    payload.code = form.code.trim().toUpperCase();
    payload.discountType = form.discountType;
    payload.discountValue = Number(form.discountValue);
    payload.maxDiscount =
      form.maxDiscount.trim() === "" ? null : Number(form.maxDiscount);
    payload.minOrderAmount = Number(form.minOrderAmount || 0);
    payload.perUserLimit = Number(form.perUserLimit);
  }

  return payload;
}

function validateForm(form, isCreate, hasUsage) {
  if (isCreate || !hasUsage) {
    if (!form.code.trim()) return "Vui lòng nhập mã Voucher.";

    if (!/^[A-Z0-9_-]{1,50}$/i.test(form.code.trim())) {
      return "Mã Voucher chỉ được chứa chữ cái, số, dấu gạch ngang và gạch dưới; tối đa 50 ký tự.";
    }

    const discountValue = Number(form.discountValue);

    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      return "Giá trị giảm phải lớn hơn 0.";
    }

    if (
      form.discountType === "PERCENTAGE" &&
      discountValue > 100
    ) {
      return "Phần trăm giảm giá không được vượt quá 100.";
    }

    if (
      form.maxDiscount.trim() !== "" &&
      (!Number.isFinite(Number(form.maxDiscount)) ||
        Number(form.maxDiscount) <= 0)
    ) {
      return "Mức giảm tối đa phải lớn hơn 0 hoặc để trống.";
    }

    if (
      !Number.isFinite(Number(form.minOrderAmount)) ||
      Number(form.minOrderAmount) < 0
    ) {
      return "Giá trị đơn hàng tối thiểu không hợp lệ.";
    }

    if (
      !Number.isInteger(Number(form.perUserLimit)) ||
      Number(form.perUserLimit) <= 0
    ) {
      return "Giới hạn mỗi người phải là số nguyên dương.";
    }
  }

  if (
    form.usageLimit.trim() !== "" &&
    (!Number.isInteger(Number(form.usageLimit)) ||
      Number(form.usageLimit) <= 0)
  ) {
    return "Tổng lượt sử dụng phải là số nguyên dương hoặc để trống.";
  }

  const startsAt = new Date(form.startsAt);
  const endsAt = new Date(form.endsAt);

  if (
    !form.startsAt ||
    !form.endsAt ||
    Number.isNaN(startsAt.getTime()) ||
    Number.isNaN(endsAt.getTime())
  ) {
    return "Vui lòng nhập đầy đủ thời gian bắt đầu và kết thúc.";
  }

  if (endsAt <= startsAt) {
    return "Thời gian kết thúc phải sau thời gian bắt đầu.";
  }

  return "";
}

export default function VoucherManagementPage({
  accessToken,
  onSessionUpdate,
  onSessionExpired,
}) {
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });

  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState({
    search: "",
    discountType: "",
    isActive: "",
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [modal, setModal] = useState(null);
  const [selectedVoucher, setSelectedVoucher] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const request = useCallback(
    (path, options = {}) =>
      voucherRequest(
        path,
        options,
        accessToken,
        onSessionUpdate
      ).catch((requestError) => {
        if (
          requestError.message.includes("Phiên đăng nhập đã hết hạn") ||
          requestError.message.includes("Không thể làm mới phiên quản trị")
        ) {
          onSessionExpired?.();
        }

        throw requestError;
      }),
    [accessToken, onSessionUpdate, onSessionExpired]
  );

  const queryString = useMemo(() => {
    const params = new URLSearchParams();

    params.set("page", String(pagination.page));
    params.set("limit", String(PAGE_SIZE));
    params.set("sortBy", filters.sortBy);
    params.set("sortOrder", filters.sortOrder);

    if (filters.search) params.set("search", filters.search);
    if (filters.discountType) {
      params.set("discountType", filters.discountType);
    }
    if (filters.isActive !== "") {
      params.set("isActive", filters.isActive);
    }

    return params.toString();
  }, [pagination.page, filters]);

  const loadVouchers = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await request(`?${queryString}`);
      setItems((result.items || []).map(normalizeVoucher));
      setPagination((current) => ({
        ...current,
        ...(result.pagination || {}),
      }));
    } catch (requestError) {
      setError(requestError.message || "Không thể tải danh sách Voucher.");
    } finally {
      setLoading(false);
    }
  }, [queryString, request]);

  useEffect(() => {
    loadVouchers();
  }, [loadVouchers]);

  function updateFilter(name, value) {
    setFilters((current) => ({
      ...current,
      [name]: value,
    }));

    setPagination((current) => ({
      ...current,
      page: 1,
    }));
  }

  function submitSearch(event) {
    event.preventDefault();
    updateFilter("search", searchInput.trim());
  }

  function openCreate() {
    setSelectedVoucher(null);
    setForm(buildForm(null));
    setFormError("");
    setModal("create");
  }

  async function openEdit(voucher) {
    setSelectedVoucher(normalizeVoucher(voucher));
    setForm(buildForm(voucher));
    setFormError("");
    setModal("edit");
  }

  async function openDetail(voucher) {
    setFormError("");
    setError("");

    try {
      const result = await request(`/${voucher.id}`);
      setSelectedVoucher(normalizeVoucher(result.data));
      setModal("detail");
    } catch (requestError) {
      setError(requestError.message || "Không thể tải chi tiết Voucher.");
    }
  }

  function closeModal() {
    if (saving) return;

    setModal(null);
    setSelectedVoucher(null);
    setFormError("");
  }

  function updateForm(name, value) {
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function submitForm(event) {
    event.preventDefault();

    const isCreate = modal === "create";
    const hasUsage = Number(selectedVoucher?.usageCount || 0) > 0;

    const validationError = validateForm(form, isCreate, hasUsage);

    if (validationError) {
      setFormError(validationError);
      return;
    }

    const usageLimit =
      form.usageLimit.trim() === "" ? null : Number(form.usageLimit);

    if (
      selectedVoucher &&
      usageLimit !== null &&
      usageLimit < selectedVoucher.usageCount
    ) {
      setFormError(
        "Tổng lượt sử dụng không được thấp hơn số lượt đã sử dụng."
      );
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      const payload = toPayload(form, isCreate);

      const result = await request(
        isCreate ? "" : `/${selectedVoucher.id}`,
        {
          method: isCreate ? "POST" : "PATCH",
          body: JSON.stringify(payload),
        }
      );

      setNotice(
        isCreate
          ? "Tạo Voucher thành công."
          : "Cập nhật Voucher thành công."
      );

      setModal(null);
      setSelectedVoucher(null);

      if (isCreate) {
        setPagination((current) => ({ ...current, page: 1 }));
      } else {
        await loadVouchers();
      }

      if (isCreate) {
        // Danh sách được tải lại sau khi chuyển về trang đầu.
        setTimeout(() => {}, 0);
      }
    } catch (requestError) {
      setFormError(requestError.message || "Không thể lưu Voucher.");

      if (requestError.details?.length) {
        const firstDetail = requestError.details[0];
        if (firstDetail?.message) {
          setFormError(firstDetail.message);
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(voucher) {
    const nextStatus = !voucher.isActive;
    const action = nextStatus ? "kích hoạt" : "tắt";

    if (!window.confirm(`Bạn có chắc muốn ${action} Voucher ${voucher.code}?`)) {
      return;
    }

    setError("");
    setNotice("");

    try {
      await request(`/${voucher.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: nextStatus }),
      });

      setNotice(
        nextStatus
          ? `Đã kích hoạt Voucher ${voucher.code}.`
          : `Đã tắt Voucher ${voucher.code}.`
      );

      await loadVouchers();
    } catch (requestError) {
      setError(requestError.message || "Không thể cập nhật trạng thái.");
    }
  }

  const totalPages = pagination.totalPages || 1;
  const hasUsage = Number(selectedVoucher?.usageCount || 0) > 0;
  const isFormModal = modal === "create" || modal === "edit";

  return (
    <div className="catalog-page voucher-page">
      <div className="catalog-page-heading">
        <div>
          <span className="catalog-eyebrow">QUẢN LÝ BÁN HÀNG</span>
          <h2>Voucher</h2>
          <p>Quản lý mã giảm giá và chương trình ưu đãi.</p>
        </div>

        <button
          type="button"
          className="catalog-primary-button"
          onClick={openCreate}
        >
          + Tạo Voucher
        </button>
      </div>

      {notice && (
        <div className="catalog-notice voucher-notice">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")}>×</button>
        </div>
      )}

      {error && (
        <div className="voucher-alert voucher-alert-error">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")}>×</button>
        </div>
      )}

      <div className="voucher-summary">
        <div className="voucher-summary-card">
          <span>Tổng Voucher</span>
          <strong>{pagination.total}</strong>
        </div>
        <div className="voucher-summary-card">
          <span>Đang hiển thị</span>
          <strong>{items.length}</strong>
        </div>
      </div>

      <div className="catalog-table-card voucher-table-card">
        <div className="catalog-table-heading">
          <div>
            <h3>Danh sách Voucher</h3>
            <span>Tra cứu và quản lý mã giảm giá</span>
          </div>
        </div>

        <div className="catalog-toolbar voucher-toolbar">
          <form className="catalog-search" onSubmit={submitSearch}>
            <input
              type="search"
              placeholder="Tìm theo mã hoặc mô tả Voucher..."
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <button type="submit">Tìm kiếm</button>
          </form>

          <div className="voucher-filters">
            <select
              aria-label="Lọc theo loại giảm giá"
              value={filters.discountType}
              onChange={(event) =>
                updateFilter("discountType", event.target.value)
              }
            >
              <option value="">Tất cả loại giảm</option>
              <option value="PERCENTAGE">Theo phần trăm</option>
              <option value="FIXED_AMOUNT">Theo số tiền</option>
            </select>

            <select
              aria-label="Lọc theo trạng thái"
              value={filters.isActive}
              onChange={(event) =>
                updateFilter("isActive", event.target.value)
              }
            >
              <option value="">Tất cả trạng thái</option>
              <option value="true">Đang bật</option>
              <option value="false">Đã tắt</option>
            </select>

            <select
              aria-label="Sắp xếp Voucher"
              value={`${filters.sortBy}:${filters.sortOrder}`}
              onChange={(event) => {
                const [sortBy, sortOrder] = event.target.value.split(":");
                setFilters((current) => ({
                  ...current,
                  sortBy,
                  sortOrder,
                }));
                setPagination((current) => ({ ...current, page: 1 }));
              }}
            >
              <option value="createdAt:desc">Mới tạo gần đây</option>
              <option value="createdAt:asc">Tạo lâu nhất</option>
              <option value="code:asc">Mã A → Z</option>
              <option value="code:desc">Mã Z → A</option>
              <option value="endsAt:asc">Sắp hết hạn</option>
              <option value="discountValue:desc">Giảm giá cao nhất</option>
            </select>
          </div>
        </div>

        <div className="voucher-table-scroll">
          <table className="catalog-table voucher-table">
            <thead>
              <tr>
                <th>Voucher</th>
                <th>Giảm giá</th>
                <th>Thời hạn</th>
                <th>Lượt sử dụng</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6">
                    <div className="catalog-table-state">
                      <span className="catalog-spinner" />
                      <span>Đang tải dữ liệu...</span>
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan="6">
                    <div className="catalog-table-state">
                      <strong>Chưa có Voucher</strong>
                      <span>Không tìm thấy Voucher phù hợp.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((voucher) => {
                  const status = getVoucherStatus(voucher);

                  return (
                    <tr key={voucher.id}>
                      <td>
                        <div className="voucher-code-cell">
                          <strong>{voucher.code}</strong>
                          <span>{voucher.description || "Không có mô tả"}</span>
                        </div>
                      </td>

                      <td>
                        <div className="voucher-discount-cell">
                          <strong>{formatDiscount(voucher)}</strong>
                          <span>
                            {voucher.discountType === "PERCENTAGE"
                              ? "Phần trăm"
                              : "Số tiền cố định"}
                          </span>
                        </div>
                      </td>

                      <td>
                        <div className="voucher-date-cell">
                          <span>{formatDate(voucher.startsAt)}</span>
                          <span>đến {formatDate(voucher.endsAt)}</span>
                        </div>
                      </td>

                      <td>
                        <div className="voucher-usage-cell">
                          <strong>
                            {voucher.usageCount}
                            {" / "}
                            {voucher.usageLimit ?? "∞"}
                          </strong>
                          <span>{voucher.orderCount} đơn hàng</span>
                        </div>
                      </td>

                      <td>
                        <span className={`voucher-status voucher-status-${status.type}`}>
                          {status.label}
                        </span>
                      </td>

                      <td>
                        <div className="catalog-row-actions voucher-actions">
                          <button
                            type="button"
                            onClick={() => openDetail(voucher)}
                            title="Xem chi tiết"
                          >
                            Xem
                          </button>
                          <button
                            type="button"
                            onClick={() => openEdit(voucher)}
                            title="Chỉnh sửa"
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            className={voucher.isActive ? "voucher-action-danger" : "voucher-action-success"}
                            onClick={() => toggleStatus(voucher)}
                            title={voucher.isActive ? "Tắt Voucher" : "Kích hoạt Voucher"}
                          >
                            {voucher.isActive ? "Tắt" : "Bật"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="catalog-pagination">
          <span>
            Tổng {pagination.total} Voucher · Trang {pagination.page} / {totalPages}
          </span>

          <div>
            <button
              type="button"
              disabled={loading || pagination.page <= 1}
              onClick={() =>
                setPagination((current) => ({
                  ...current,
                  page: current.page - 1,
                }))
              }
            >
              Trước
            </button>

            <strong>{pagination.page}</strong>

            <button
              type="button"
              disabled={loading || pagination.page >= totalPages}
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

      {modal && (
        <div
          className="catalog-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <div
            className={`catalog-modal voucher-modal ${modal === "detail" ? "voucher-detail-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="voucher-modal-title"
          >
            <div className="catalog-modal-heading">
              <div>
                <span className="catalog-eyebrow">QUẢN LÝ VOUCHER</span>
                <h3 id="voucher-modal-title">
                  {modal === "create"
                    ? "Tạo Voucher mới"
                    : modal === "edit"
                      ? "Chỉnh sửa Voucher"
                      : "Chi tiết Voucher"}
                </h3>
              </div>

              <button
                type="button"
                className="catalog-modal-close"
                onClick={closeModal}
                disabled={saving}
                aria-label="Đóng"
              >
                ×
              </button>
            </div>

            {isFormModal ? (
              <form onSubmit={submitForm}>
                {hasUsage && (
                  <div className="voucher-lock-notice">
                    <strong>Voucher đã được sử dụng</strong>
                    <span>
                      Các điều kiện thương mại đã bị khóa để bảo vệ lịch sử đơn hàng.
                    </span>
                  </div>
                )}

                <div className="voucher-form-grid">
                  <label className="catalog-form-field voucher-field-full">
                    <span>Mã Voucher *</span>
                    <input
                      value={form.code}
                      maxLength={50}
                      disabled={saving || (modal === "edit" && hasUsage)}
                      onChange={(event) =>
                        updateForm("code", event.target.value.toUpperCase())
                      }
                      placeholder="VD: WELCOME2026"
                    />
                  </label>

                  <label className="catalog-form-field voucher-field-full">
                    <span>Mô tả</span>
                    <textarea
                      rows={2}
                      value={form.description}
                      disabled={saving}
                      onChange={(event) =>
                        updateForm("description", event.target.value)
                      }
                      placeholder="Mô tả chương trình ưu đãi..."
                    />
                  </label>

                  <label className="catalog-form-field">
                    <span>Loại giảm giá *</span>
                    <select
                      value={form.discountType}
                      disabled={saving || (modal === "edit" && hasUsage)}
                      onChange={(event) =>
                        updateForm("discountType", event.target.value)
                      }
                    >
                      <option value="PERCENTAGE">Theo phần trăm (%)</option>
                      <option value="FIXED_AMOUNT">Số tiền cố định (₫)</option>
                    </select>
                  </label>

                  <label className="catalog-form-field">
                    <span>
                      Giá trị giảm *
                      {form.discountType === "PERCENTAGE" ? " (%)" : " (₫)"}
                    </span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={form.discountValue}
                      disabled={saving || (modal === "edit" && hasUsage)}
                      onChange={(event) =>
                        updateForm("discountValue", event.target.value)
                      }
                    />
                  </label>

                  <label className="catalog-form-field">
                    <span>Giảm tối đa (₫)</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={form.maxDiscount}
                      disabled={saving || (modal === "edit" && hasUsage)}
                      onChange={(event) =>
                        updateForm("maxDiscount", event.target.value)
                      }
                      placeholder="Không giới hạn"
                    />
                  </label>

                  <label className="catalog-form-field">
                    <span>Đơn hàng tối thiểu (₫)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.minOrderAmount}
                      disabled={saving || (modal === "edit" && hasUsage)}
                      onChange={(event) =>
                        updateForm("minOrderAmount", event.target.value)
                      }
                    />
                  </label>

                  <label className="catalog-form-field">
                    <span>Tổng lượt sử dụng</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={form.usageLimit}
                      disabled={saving}
                      onChange={(event) =>
                        updateForm("usageLimit", event.target.value)
                      }
                      placeholder="Không giới hạn"
                    />
                  </label>

                  <label className="catalog-form-field">
                    <span>Lượt mỗi người</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={form.perUserLimit}
                      disabled={saving || (modal === "edit" && hasUsage)}
                      onChange={(event) =>
                        updateForm("perUserLimit", event.target.value)
                      }
                    />
                  </label>

                  <label className="catalog-form-field">
                    <span>Bắt đầu *</span>
                    <input
                      type="datetime-local"
                      value={form.startsAt}
                      disabled={saving}
                      onChange={(event) =>
                        updateForm("startsAt", event.target.value)
                      }
                    />
                  </label>

                  <label className="catalog-form-field">
                    <span>Kết thúc *</span>
                    <input
                      type="datetime-local"
                      value={form.endsAt}
                      disabled={saving}
                      onChange={(event) =>
                        updateForm("endsAt", event.target.value)
                      }
                    />
                  </label>
                </div>

                <label className="catalog-checkbox-field voucher-active-checkbox">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    disabled={saving}
                    onChange={(event) =>
                      updateForm("isActive", event.target.checked)
                    }
                  />
                  <span>Kích hoạt Voucher</span>
                </label>

                {formError && (
                  <div className="voucher-alert voucher-alert-error">
                    {formError}
                  </div>
                )}

                <div className="catalog-modal-actions">
                  <button
                    type="button"
                    className="catalog-secondary-button"
                    onClick={closeModal}
                    disabled={saving}
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="catalog-primary-button"
                    disabled={saving}
                  >
                    {saving
                      ? "Đang lưu..."
                      : modal === "create"
                        ? "Tạo Voucher"
                        : "Lưu thay đổi"}
                  </button>
                </div>
              </form>
            ) : selectedVoucher ? (
              <div className="voucher-detail-content">
                <div className="voucher-detail-code">
                  <div>
                    <span>MÃ VOUCHER</span>
                    <strong>{selectedVoucher.code}</strong>
                  </div>
                  <span className={`voucher-status voucher-status-${getVoucherStatus(selectedVoucher).type}`}>
                    {getVoucherStatus(selectedVoucher).label}
                  </span>
                </div>

                <p className="voucher-detail-description">
                  {selectedVoucher.description || "Không có mô tả."}
                </p>

                <div className="voucher-detail-highlight">
                  <span>Giá trị ưu đãi</span>
                  <strong>{formatDiscount(selectedVoucher)}</strong>
                  <small>
                    {selectedVoucher.discountType === "PERCENTAGE"
                      ? `Giảm tối đa: ${selectedVoucher.maxDiscount == null ? "Không giới hạn" : formatMoney(selectedVoucher.maxDiscount)}`
                      : "Giảm theo số tiền cố định"}
                  </small>
                </div>

                <div className="voucher-detail-grid">
                  <div>
                    <span>Đơn hàng tối thiểu</span>
                    <strong>{formatMoney(selectedVoucher.minOrderAmount)}</strong>
                  </div>
                  <div>
                    <span>Lượt mỗi người</span>
                    <strong>{selectedVoucher.perUserLimit}</strong>
                  </div>
                  <div>
                    <span>Đã sử dụng</span>
                    <strong>{selectedVoucher.usageCount}</strong>
                  </div>
                  <div>
                    <span>Tổng giới hạn</span>
                    <strong>{selectedVoucher.usageLimit ?? "Không giới hạn"}</strong>
                  </div>
                  <div>
                    <span>Đơn hàng liên quan</span>
                    <strong>{selectedVoucher.orderCount}</strong>
                  </div>
                  <div>
                    <span>Trạng thái kích hoạt</span>
                    <strong>{selectedVoucher.isActive ? "Đã bật" : "Đã tắt"}</strong>
                  </div>
                  <div>
                    <span>Bắt đầu</span>
                    <strong>{formatDate(selectedVoucher.startsAt)}</strong>
                  </div>
                  <div>
                    <span>Kết thúc</span>
                    <strong>{formatDate(selectedVoucher.endsAt)}</strong>
                  </div>
                  <div>
                    <span>Ngày tạo</span>
                    <strong>{formatDate(selectedVoucher.createdAt)}</strong>
                  </div>
                  <div>
                    <span>Cập nhật lần cuối</span>
                    <strong>{formatDate(selectedVoucher.updatedAt)}</strong>
                  </div>
                </div>

                <div className="catalog-modal-actions">
                  <button
                    type="button"
                    className="catalog-secondary-button"
                    onClick={closeModal}
                  >
                    Đóng
                  </button>
                  <button
                    type="button"
                    className="catalog-primary-button"
                    onClick={() => {
                      setForm(buildForm(selectedVoucher));
                      setFormError("");
                      setModal("edit");
                    }}
                  >
                    Chỉnh sửa
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
