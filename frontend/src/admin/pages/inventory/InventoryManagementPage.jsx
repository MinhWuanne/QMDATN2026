import { useCallback, useEffect, useState } from "react";
import { inventoryService } from "../../services/admin-inventory.service.js";

const STOCK_STATUS = {
  IN_STOCK: {
    label: "Còn hàng",
    className: "is-active",
  },
  LOW_STOCK: {
    label: "Sắp hết hàng",
    className: "is-low",
  },
  OUT_OF_STOCK: {
    label: "Hết hàng",
    className: "is-inactive",
  },
};

const MOVEMENT_TYPES = {
  PURCHASE: {
    label: "Nhập kho",
    className: "is-positive",
  },
  SALE: {
    label: "Bán hàng",
    className: "is-negative",
  },
  ORDER_CANCEL: {
    label: "Hủy đơn hàng",
    className: "is-positive",
  },
  CUSTOMER_RETURN: {
    label: "Khách trả hàng",
    className: "is-positive",
  },
  ADJUSTMENT: {
    label: "Điều chỉnh",
    className: "is-adjustment",
  },
};

function formatNumber(value) {
  return new Intl.NumberFormat("vi-VN").format(
    Number(value || 0)
  );
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

function getStatusInfo(status) {
  return (
    STOCK_STATUS[status] || {
      label: "Không xác định",
      className: "",
    }
  );
}

function getMovementInfo(type) {
  return (
    MOVEMENT_TYPES[type] || {
      label: type || "Không xác định",
      className: "",
    }
  );
}

function getMovementQuantity(movement) {
  const quantity = Number(movement.quantity || 0);

  if (movement.type === "PURCHASE") return `+${formatNumber(quantity)}`;

  if (
    movement.type === "SALE" ||
    movement.type === "ADJUSTMENT"
  ) {
    return quantity > 0
      ? `+${formatNumber(quantity)}`
      : formatNumber(quantity);
  }

  if (
    movement.type === "ORDER_CANCEL" ||
    movement.type === "CUSTOMER_RETURN"
  ) {
    return `+${formatNumber(Math.abs(quantity))}`;
  }

  return formatNumber(quantity);
}

export default function InventoryManagementPage({
  accessToken,
  onSessionUpdate,
  onSessionExpired,
}) {
  // =========================
  // DANH SÁCH TỒN KHO
  // =========================

  const [items, setItems] = useState([]);

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [stockStatus, setStockStatus] = useState("all");
  const [sortBy, setSortBy] = useState("updatedAt");
  const [sortOrder, setSortOrder] = useState("desc");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // =========================
  // MODAL NHẬP / ĐIỀU CHỈNH
  // =========================

  const [modalType, setModalType] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);

  const [form, setForm] = useState({
    quantity: "",
    actualStock: "",
    note: "",
  });

  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");

  // =========================
  // LỊCH SỬ TỒN KHO
  // =========================

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyInventory, setHistoryInventory] = useState(null);
  const [movements, setMovements] = useState([]);

  const [movementPagination, setMovementPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });

  const [movementType, setMovementType] = useState("all");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  // =========================
  // TẢI DANH SÁCH TỒN KHO
  // =========================

  const loadInventory = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await inventoryService.list(
        {
          page: pagination.page,
          limit: pagination.limit,
          search: search || undefined,
          stockStatus:
            stockStatus === "all"
              ? undefined
              : stockStatus,
          sortBy,
          sortOrder,
        },
        accessToken,
        onSessionUpdate
      );

      setItems(Array.isArray(result.items) ? result.items : []);

      setPagination((current) => ({
        ...current,
        ...(result.pagination || {}),
      }));
    } catch (err) {
      setError(err.message || "Không thể tải dữ liệu tồn kho.");

      if (err.message?.includes("Phiên đăng nhập đã hết hạn")) {
        onSessionExpired?.();
      }
    } finally {
      setLoading(false);
    }
  }, [
    accessToken,
    onSessionExpired,
    onSessionUpdate,
    pagination.page,
    pagination.limit,
    search,
    stockStatus,
    sortBy,
    sortOrder,
  ]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  // =========================
  // TÌM KIẾM / LỌC / SẮP XẾP
  // =========================

  function submitSearch(event) {
    event.preventDefault();

    setPagination((current) => ({
      ...current,
      page: 1,
    }));

    setSearch(searchInput.trim());
  }

  function changeStockStatus(value) {
    setStockStatus(value);

    setPagination((current) => ({
      ...current,
      page: 1,
    }));
  }

  function changeSort(value) {
    setSortBy(value);

    setPagination((current) => ({
      ...current,
      page: 1,
    }));
  }

  function changeSortOrder(value) {
    setSortOrder(value);

    setPagination((current) => ({
      ...current,
      page: 1,
    }));
  }

  // =========================
  // MODAL NHẬP / ĐIỀU CHỈNH
  // =========================

  function openStockModal(type, item) {
    setSelectedItem(item);
    setModalType(type);

    setForm({
      quantity: "",
      actualStock: String(item.quantityOnHand ?? 0),
      note: "",
    });

    setModalError("");
    setError("");
  }

  function closeStockModal() {
    if (saving) return;

    setModalType(null);
    setSelectedItem(null);
    setModalError("");
  }

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleStockSubmit(event) {
    event.preventDefault();

    if (saving || !selectedItem) return;

    setSaving(true);
    setModalError("");
    setError("");
    setNotice("");

    try {
      const variantId = selectedItem.variantId;

      if (modalType === "purchase") {
        const quantity = Number(form.quantity);

        if (
          !Number.isInteger(quantity) ||
          quantity <= 0 ||
          quantity > 1000000
        ) {
          throw new Error(
            "Số lượng nhập phải là số nguyên lớn hơn 0 và không vượt quá 1.000.000."
          );
        }

        await inventoryService.purchase(
          {
            variantId,
            quantity,
            note: form.note.trim() || null,
          },
          accessToken,
          onSessionUpdate
        );

        setNotice(
          `Đã nhập thêm ${formatNumber(quantity)} sản phẩm vào kho.`
        );
      } else if (modalType === "adjustment") {
        const actualStock = Number(form.actualStock);

        if (
          !Number.isInteger(actualStock) ||
          actualStock < 0 ||
          actualStock > 1000000
        ) {
          throw new Error(
            "Số tồn thực tế phải là số nguyên từ 0 đến 1.000.000."
          );
        }

        if (!form.note.trim()) {
          throw new Error(
            "Vui lòng nhập lý do điều chỉnh tồn kho."
          );
        }

        const result = await inventoryService.adjustment(
          {
            variantId,
            actualStock,
            note: form.note.trim(),
          },
          accessToken,
          onSessionUpdate
        );

        setNotice(
          result.unchanged || result.data?.unchanged
            ? "Kiểm kê hoàn tất. Số tồn kho không thay đổi."
            : "Đã điều chỉnh tồn kho thành công."
        );
      }

      setModalType(null);
      setSelectedItem(null);

      // Quay về trang đầu để hiển thị dữ liệu mới nhất.
      setPagination((current) => ({
        ...current,
        page: 1,
      }));

      // Nếu đang ở trang đầu, chủ động tải lại ngay.
      if (pagination.page === 1) {
        await loadInventory();
      }
    } catch (err) {
      setModalError(err.message || "Không thể cập nhật tồn kho.");

      if (err.message?.includes("Phiên đăng nhập đã hết hạn")) {
        onSessionExpired?.();
      }
    } finally {
      setSaving(false);
    }
  }

  // =========================
  // LỊCH SỬ TỒN KHO
  // =========================

  const loadMovements = useCallback(async () => {
    if (!historyInventory?.variantId) return;

    setHistoryLoading(true);
    setHistoryError("");

    try {
      const [detailResult, movementResult] = await Promise.all([
        inventoryService.getByVariantId(
          historyInventory.variantId,
          accessToken,
          onSessionUpdate
        ),

        inventoryService.listMovements(
          historyInventory.variantId,
          {
            page: movementPagination.page,
            limit: movementPagination.limit,
            type:
              movementType === "all"
                ? undefined
                : movementType,
            sortOrder: "desc",
          },
          accessToken,
          onSessionUpdate
        ),
      ]);

      setHistoryInventory(detailResult.data || detailResult);

      setMovements(
        Array.isArray(movementResult.items)
          ? movementResult.items
          : []
      );

      setMovementPagination((current) => ({
        ...current,
        ...(movementResult.pagination || {}),
      }));
    } catch (err) {
      setHistoryError(
        err.message || "Không thể tải lịch sử tồn kho."
      );

      if (err.message?.includes("Phiên đăng nhập đã hết hạn")) {
        onSessionExpired?.();
      }
    } finally {
      setHistoryLoading(false);
    }
  }, [
    accessToken,
    historyInventory?.variantId,
    movementPagination.page,
    movementPagination.limit,
    movementType,
    onSessionExpired,
    onSessionUpdate,
  ]);

  useEffect(() => {
    if (historyOpen && historyInventory?.variantId) {
      loadMovements();
    }
  }, [historyOpen, historyInventory?.variantId, loadMovements]);

  function openHistory(item) {
    setHistoryInventory(item);
    setHistoryOpen(true);
    setHistoryError("");
    setMovementType("all");

    setMovementPagination((current) => ({
      ...current,
      page: 1,
    }));
  }

  function closeHistory() {
    if (historyLoading) return;

    setHistoryOpen(false);
    setHistoryInventory(null);
    setMovements([]);
    setHistoryError("");
  }

  // =========================
  // PHÂN TRANG
  // =========================

  const pageCount = pagination.totalPages || 0;

  const start =
    pagination.total === 0
      ? 0
      : (pagination.page - 1) * pagination.limit + 1;

  const end = Math.min(
    pagination.page * pagination.limit,
    pagination.total
  );

  const movementPageCount =
    movementPagination.totalPages || 0;

  const movementStart =
    movementPagination.total === 0
      ? 0
      : (movementPagination.page - 1) *
      movementPagination.limit +
      1;

  const movementEnd = Math.min(
    movementPagination.page * movementPagination.limit,
    movementPagination.total
  );

  // =========================
  // GIAO DIỆN
  // =========================

  return (
    <section className="catalog-page inventory-page">
      <div className="catalog-page-heading">
        <div>
          <span className="admin-eyebrow">
            INVENTORY MANAGEMENT
          </span>

          <h2>Quản lý kho hàng</h2>

          <p>
            Theo dõi tồn kho, nhập hàng, kiểm kê và lịch sử
            biến động kho của cửa hàng.
          </p>
        </div>
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

      <div className="catalog-toolbar inventory-toolbar">
        <form className="catalog-search" onSubmit={submitSearch}>
          <span aria-hidden="true">⌕</span>

          <input
            value={searchInput}
            onChange={(event) =>
              setSearchInput(event.target.value)
            }
            placeholder="Tìm theo tên sản phẩm hoặc SKU..."
            aria-label="Tìm sản phẩm hoặc SKU"
          />

          <button type="submit">Tìm kiếm</button>
        </form>

        <select
          className="catalog-status-filter"
          value={stockStatus}
          onChange={(event) =>
            changeStockStatus(event.target.value)
          }
          aria-label="Lọc trạng thái tồn kho"
        >
          <option value="all">Tất cả tồn kho</option>
          <option value="IN_STOCK">Còn hàng</option>
          <option value="LOW_STOCK">Sắp hết hàng</option>
          <option value="OUT_OF_STOCK">Hết hàng</option>
        </select>
      </div>

      <div className="inventory-sort-toolbar">
        <label>
          Sắp xếp theo

          <select
            value={sortBy}
            onChange={(event) => changeSort(event.target.value)}
          >
            <option value="updatedAt">Lần cập nhật</option>
            <option value="quantityOnHand">Tồn thực tế</option>
            <option value="reservedQuantity">Đã giữ</option>
            <option value="availableQuantity">Có thể bán</option>
            <option value="sku">SKU</option>
            <option value="productName">Tên sản phẩm</option>
          </select>
        </label>

        <select
          value={sortOrder}
          onChange={(event) =>
            changeSortOrder(event.target.value)
          }
          aria-label="Thứ tự sắp xếp"
        >
          <option value="desc">Giảm dần</option>
          <option value="asc">Tăng dần</option>
        </select>
      </div>

      <div className="catalog-table-card">
        <div className="catalog-table-heading">
          <div>
            <h3>Danh sách tồn kho</h3>
            <span>{pagination.total} biến thể</span>
          </div>

          <button
            className="catalog-refresh-button"
            onClick={loadInventory}
            disabled={loading}
          >
            ↻ Làm mới
          </button>
        </div>

        <div className="catalog-table-scroll">
          <table className="catalog-table inventory-table">
            <thead>
              <tr>
                <th>Sản phẩm</th>
                <th>SKU</th>
                <th>Tồn thực tế</th>
                <th>Đã giữ</th>
                <th>Có thể bán</th>
                <th>Trạng thái</th>
                <th>Cập nhật</th>
                <th>Thao tác</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8}>
                    <div className="catalog-table-state">
                      <span className="catalog-spinner" />
                      Đang tải dữ liệu tồn kho...
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="catalog-table-state">
                      <strong>Chưa có dữ liệu tồn kho</strong>
                      <span>
                        Không tìm thấy biến thể sản phẩm phù hợp.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const status = getStatusInfo(item.stockStatus);

                  return (
                    <tr key={item.variantId}>
                      <td>
                        <div className="inventory-product-cell">
                          <strong>
                            {item.variant?.product?.name || "Sản phẩm"}
                          </strong>

                          <small>
                            {item.variant?.name || "Biến thể"}
                          </small>
                        </div>
                      </td>

                      <td>
                        <code className="catalog-slug">
                          {item.variant?.sku || "—"}
                        </code>
                      </td>

                      <td>
                        <strong>
                          {formatNumber(item.quantityOnHand)}
                        </strong>
                      </td>

                      <td>
                        {formatNumber(item.reservedQuantity)}
                      </td>

                      <td>
                        <strong className="inventory-available">
                          {formatNumber(item.availableQuantity)}
                        </strong>
                      </td>

                      <td>
                        <span
                          className={`catalog-status ${status.className}`}
                        >
                          {status.label}
                        </span>
                      </td>

                      <td>
                        <small>{formatDate(item.updatedAt)}</small>
                      </td>

                      <td>
                        <div className="inventory-row-actions">
                          <button
                            type="button"
                            onClick={() =>
                              openStockModal("purchase", item)
                            }
                          >
                            ＋ Nhập
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              openStockModal("adjustment", item)
                            }
                          >
                            Điều chỉnh
                          </button>

                          <button
                            type="button"
                            className="is-history"
                            onClick={() => openHistory(item)}
                          >
                            Lịch sử
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
            Hiển thị {start}–{end} trong {pagination.total} biến thể
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
              disabled={
                loading ||
                pageCount === 0 ||
                pagination.page >= pageCount
              }
            >
              Sau →
            </button>
          </div>
        </div>
      </div>

      {/* =========================
          MODAL NHẬP / ĐIỀU CHỈNH
      ========================= */}

      {modalType && selectedItem && (
        <div
          className="catalog-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeStockModal();
            }
          }}
        >
          <section
            className="catalog-modal inventory-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-modal-title"
          >
            <div className="catalog-modal-heading">
              <div>
                <span className="admin-eyebrow">
                  {modalType === "purchase"
                    ? "STOCK RECEIPT"
                    : "STOCK ADJUSTMENT"}
                </span>

                <h3 id="inventory-modal-title">
                  {modalType === "purchase"
                    ? "Nhập kho"
                    : "Điều chỉnh tồn kho"}
                </h3>
              </div>

              <button
                className="catalog-modal-close"
                onClick={closeStockModal}
                disabled={saving}
                aria-label="Đóng"
              >
                ×
              </button>
            </div>

            <div className="inventory-modal-product">
              <strong>
                {selectedItem.variant?.product?.name || "Sản phẩm"}
              </strong>

              <span>
                {selectedItem.variant?.name || "Biến thể"} · SKU:{" "}
                {selectedItem.variant?.sku || "—"}
              </span>

              <div>
                <span>Tồn thực tế hiện tại</span>
                <strong>
                  {formatNumber(selectedItem.quantityOnHand)}
                </strong>
              </div>

              <div>
                <span>Đã giữ</span>
                <strong>
                  {formatNumber(selectedItem.reservedQuantity)}
                </strong>
              </div>

              <div>
                <span>Có thể bán</span>
                <strong>
                  {formatNumber(selectedItem.availableQuantity)}
                </strong>
              </div>
            </div>

            {modalError && (
              <div className="admin-alert admin-alert-error" role="alert">
                {modalError}
              </div>
            )}

            <form onSubmit={handleStockSubmit}>
              {modalType === "purchase" ? (
                <label className="catalog-form-field">
                  <span>Số lượng nhập thêm</span>

                  <input
                    type="number"
                    min="1"
                    max="1000000"
                    step="1"
                    value={form.quantity}
                    onChange={(event) =>
                      updateForm("quantity", event.target.value)
                    }
                    required
                    placeholder="Nhập số lượng..."
                    disabled={saving}
                  />

                  <small>
                    Số lượng này sẽ được cộng vào tồn kho hiện tại.
                  </small>
                </label>
              ) : (
                <label className="catalog-form-field">
                  <span>Số tồn thực tế sau kiểm kê</span>

                  <input
                    type="number"
                    min="0"
                    max="1000000"
                    step="1"
                    value={form.actualStock}
                    onChange={(event) =>
                      updateForm("actualStock", event.target.value)
                    }
                    required
                    placeholder="Nhập số lượng thực tế..."
                    disabled={saving}
                  />

                  <small>
                    Nhập tổng số hàng thực tế đang có, không phải
                    số lượng chênh lệch.
                  </small>
                </label>
              )}

              <label className="catalog-form-field">
                <span>
                  Ghi chú{" "}
                  {modalType === "adjustment" ? "(bắt buộc)" : "(không bắt buộc)"}
                </span>

                <textarea
                  value={form.note}
                  onChange={(event) =>
                    updateForm("note", event.target.value)
                  }
                  maxLength={1000}
                  rows={3}
                  required={modalType === "adjustment"}
                  placeholder={
                    modalType === "purchase"
                      ? "Ví dụ: Nhập hàng từ nhà cung cấp..."
                      : "Ví dụ: Kiểm kê thực tế cuối ngày..."
                  }
                  disabled={saving}
                />
              </label>

              {modalType === "adjustment" && (
                <div className="inventory-adjustment-warning">
                  Lưu ý: Số tồn thực tế không được thấp hơn số lượng
                  đã giữ cho đơn hàng.
                </div>
              )}

              <div className="catalog-modal-actions">
                <button
                  type="button"
                  className="catalog-secondary-button"
                  onClick={closeStockModal}
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
                    ? "Đang xử lý..."
                    : modalType === "purchase"
                      ? "Xác nhận nhập kho"
                      : "Xác nhận điều chỉnh"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* =========================
          MODAL LỊCH SỬ TỒN KHO
      ========================= */}

      {historyOpen && historyInventory && (
        <div
          className="catalog-modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !historyLoading
            ) {
              closeHistory();
            }
          }}
        >
          <section
            className="catalog-modal inventory-history-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-history-title"
          >
            <div className="catalog-modal-heading">
              <div>
                <span className="admin-eyebrow">
                  INVENTORY MOVEMENTS
                </span>

                <h3 id="inventory-history-title">
                  Lịch sử tồn kho
                </h3>
              </div>

              <button
                className="catalog-modal-close"
                onClick={closeHistory}
                disabled={historyLoading}
                aria-label="Đóng"
              >
                ×
              </button>
            </div>

            <div className="inventory-history-product">
              <strong>
                {historyInventory.variant?.product?.name || "Sản phẩm"}
              </strong>

              <span>
                {historyInventory.variant?.name || "Biến thể"} · SKU:{" "}
                {historyInventory.variant?.sku || "—"}
              </span>

              <div className="inventory-history-summary">
                <div>
                  <small>Tồn thực tế</small>
                  <strong>
                    {formatNumber(historyInventory.quantityOnHand)}
                  </strong>
                </div>

                <div>
                  <small>Đã giữ</small>
                  <strong>
                    {formatNumber(historyInventory.reservedQuantity)}
                  </strong>
                </div>

                <div>
                  <small>Có thể bán</small>
                  <strong>
                    {formatNumber(
                      historyInventory.availableQuantity ??
                      Number(historyInventory.quantityOnHand || 0) -
                      Number(historyInventory.reservedQuantity || 0)
                    )}
                  </strong>
                </div>
              </div>
            </div>

            {historyError && (
              <div className="admin-alert admin-alert-error" role="alert">
                {historyError}
              </div>
            )}

            <div className="inventory-history-toolbar">
              <label>
                Loại biến động

                <select
                  value={movementType}
                  onChange={(event) => {
                    setMovementType(event.target.value);

                    setMovementPagination((current) => ({
                      ...current,
                      page: 1,
                    }));
                  }}
                >
                  <option value="all">Tất cả biến động</option>
                  <option value="PURCHASE">Nhập kho</option>
                  <option value="SALE">Bán hàng</option>
                  <option value="ORDER_CANCEL">Hủy đơn hàng</option>
                  <option value="CUSTOMER_RETURN">Khách trả hàng</option>
                  <option value="ADJUSTMENT">Điều chỉnh</option>
                </select>
              </label>

              <button
                className="catalog-refresh-button"
                onClick={loadMovements}
                disabled={historyLoading}
              >
                ↻ Làm mới
              </button>
            </div>

            <div className="inventory-history-table-wrap">
              <table className="catalog-table inventory-history-table">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Loại biến động</th>
                    <th>Thay đổi</th>
                    <th>Tồn trước</th>
                    <th>Tồn sau</th>
                    <th>Ghi chú</th>
                  </tr>
                </thead>

                <tbody>
                  {historyLoading ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="catalog-table-state">
                          <span className="catalog-spinner" />
                          Đang tải lịch sử...
                        </div>
                      </td>
                    </tr>
                  ) : movements.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="catalog-table-state">
                          <strong>Chưa có lịch sử biến động</strong>
                          <span>
                            Các lần nhập kho và điều chỉnh sẽ xuất hiện
                            tại đây.
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    movements.map((movement) => {
                      const movementInfo = getMovementInfo(
                        movement.type
                      );

                      return (
                        <tr key={movement.id}>
                          <td>
                            <small>
                              {formatDate(movement.createdAt)}
                            </small>
                          </td>

                          <td>
                            <span
                              className={`inventory-movement-type ${movementInfo.className}`}
                            >
                              {movementInfo.label}
                            </span>
                          </td>

                          <td>
                            <strong
                              className={`inventory-movement-quantity ${movementInfo.className}`}
                            >
                              {getMovementQuantity(movement)}
                            </strong>
                          </td>

                          <td>
                            {formatNumber(movement.beforeStock)}
                          </td>

                          <td>
                            <strong>
                              {formatNumber(movement.afterStock)}
                            </strong>
                          </td>

                          <td>
                            <span className="inventory-movement-note">
                              {movement.note || "—"}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="catalog-pagination inventory-history-pagination">
              <span>
                Hiển thị {movementStart}–{movementEnd} trong{" "}
                {movementPagination.total} biến động
              </span>

              <div>
                <button
                  onClick={() =>
                    setMovementPagination((current) => ({
                      ...current,
                      page: Math.max(1, current.page - 1),
                    }))
                  }
                  disabled={
                    historyLoading ||
                    movementPagination.page <= 1
                  }
                >
                  ← Trước
                </button>

                <span>
                  Trang {movementPagination.page} /{" "}
                  {Math.max(1, movementPageCount)}
                </span>

                <button
                  onClick={() =>
                    setMovementPagination((current) => ({
                      ...current,
                      page: Math.min(
                        movementPageCount,
                        current.page + 1
                      ),
                    }))
                  }
                  disabled={
                    historyLoading ||
                    movementPageCount === 0 ||
                    movementPagination.page >= movementPageCount
                  }
                >
                  Sau →
                </button>
              </div>
            </div>

            <div className="catalog-modal-actions">
              <button
                type="button"
                className="catalog-secondary-button"
                onClick={closeHistory}
                disabled={historyLoading}
              >
                Đóng
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}