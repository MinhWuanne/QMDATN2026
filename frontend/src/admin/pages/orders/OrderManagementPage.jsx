
import { useCallback, useEffect, useState } from "react";
import { adminOrderService } from "../../services/admin-order.service.js";

const ORDER_STATUSES = {
  PENDING_CONFIRMATION: {
    label: "Chờ xác nhận",
    className: "is-pending",
  },
  CONFIRMED: {
    label: "Đã xác nhận",
    className: "is-confirmed",
  },
  PROCESSING: {
    label: "Đang xử lý",
    className: "is-processing",
  },
  SHIPPING: {
    label: "Đang giao hàng",
    className: "is-shipping",
  },
  DELIVERED: {
    label: "Đã giao hàng",
    className: "is-delivered",
  },
  COMPLETED: {
    label: "Hoàn thành",
    className: "is-completed",
  },
  CANCELLED: {
    label: "Đã hủy",
    className: "is-cancelled",
  },
};

const PAYMENT_STATUSES = {
  PENDING: {
    label: "Chưa thanh toán",
    className: "is-pending",
  },
  PAID: {
    label: "Đã thanh toán",
    className: "is-paid",
  },
  FAILED: {
    label: "Thanh toán thất bại",
    className: "is-failed",
  },
  CANCELLED: {
    label: "Đã hủy thanh toán",
    className: "is-cancelled",
  },
  REFUNDED: {
    label: "Đã hoàn tiền",
    className: "is-refunded",
  },
  PARTIALLY_REFUNDED: {
    label: "Hoàn tiền một phần",
    className: "is-refunded",
  },
};

const STATUS_TRANSITIONS = {
  PENDING_CONFIRMATION: "CONFIRMED",
  CONFIRMED: "PROCESSING",
  PROCESSING: "SHIPPING",
  SHIPPING: "DELIVERED",
  DELIVERED: "COMPLETED",
};

const STATUS_ACTION_LABELS = {
  CONFIRMED: "Xác nhận đơn",
  PROCESSING: "Bắt đầu xử lý",
  SHIPPING: "Bàn giao vận chuyển",
  DELIVERED: "Xác nhận đã giao",
  COMPLETED: "Hoàn thành đơn",
};

const PAYMENT_METHODS = {
  COD: "Thanh toán khi nhận hàng",
  VNPAY: "VNPay",
};

const DEFAULT_PAGINATION = {
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 0,
};

function formatNumber(value) {
  return new Intl.NumberFormat("vi-VN").format(Number(value || 0));
}

function formatCurrency(value) {
  return `${formatNumber(value)} ₫`;
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

function getOrderStatus(status) {
  return (
    ORDER_STATUSES[status] || {
      label: status || "Không xác định",
      className: "",
    }
  );
}

function getPaymentStatus(status) {
  return (
    PAYMENT_STATUSES[status] || {
      label: status || "Không xác định",
      className: "",
    }
  );
}

function getCustomerName(order) {
  return (
    order?.shippingRecipientName ||
    order?.user?.fullName ||
    "Khách hàng"
  );
}

function getOrderItemSummary(order) {
  const items = order?.items || [];

  if (items.length === 0) return "Không có sản phẩm";

  const totalQuantity = items.reduce(
    (total, item) => total + Number(item.quantity || 0),
    0
  );

  return `${items.length} sản phẩm · ${formatNumber(totalQuantity)} đơn vị`;
}

function canMarkPaid(order) {
  return (
    order?.paymentMethod === "COD" &&
    order?.payment?.status === "PENDING" &&
    order?.status !== "CANCELLED"
  );
}

function canCancelOrder(order) {
  return [
    "PENDING_CONFIRMATION",
    "CONFIRMED",
    "PROCESSING",
  ].includes(order?.status);
}

function getNextStatus(order) {
  return STATUS_TRANSITIONS[order?.status] || null;
}

function getPaymentMethodLabel(method) {
  return PAYMENT_METHODS[method] || method || "—";
}

export default function OrderManagementPage({
  accessToken,
  onSessionUpdate,
  onSessionExpired,
}) {
  // =========================
  // DANH SÁCH ĐƠN HÀNG
  // =========================

  const [orders, setOrders] = useState([]);

  const [pagination, setPagination] = useState({
    ...DEFAULT_PAGINATION,
  });

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [paymentStatus, setPaymentStatus] = useState("all");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // =========================
  // CHI TIẾT ĐƠN HÀNG
  // =========================

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  // =========================
  // THAO TÁC ĐƠN HÀNG
  // =========================

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  // =========================
  // TẢI DANH SÁCH ĐƠN HÀNG
  // =========================

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await adminOrderService.list(
        {
          page: pagination.page,
          limit: pagination.limit,
          search: search || undefined,
          status: status === "all" ? undefined : status,
          paymentMethod:
            paymentMethod === "all" ? undefined : paymentMethod,
          paymentStatus:
            paymentStatus === "all" ? undefined : paymentStatus,
          sortOrder: "desc",
        },
        accessToken,
        onSessionUpdate
      );

      setOrders(
        Array.isArray(result.data?.data) ? result.data.data : []
      );

      setPagination((current) => ({
        ...current,
        ...(result.data?.pagination || {}),
      }));
    } catch (err) {
      setError(err.message || "Không thể tải danh sách đơn hàng.");

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
    status,
    paymentMethod,
    paymentStatus,
  ]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // =========================
  // TÌM KIẾM VÀ BỘ LỌC
  // =========================

  function resetPage() {
    setPagination((current) => ({
      ...current,
      page: 1,
    }));
  }

  function submitSearch(event) {
    event.preventDefault();

    setSearch(searchInput.trim());
    resetPage();
  }

  function changeStatus(value) {
    setStatus(value);
    resetPage();
  }

  function changePaymentMethod(value) {
    setPaymentMethod(value);
    resetPage();
  }

  function changePaymentStatus(value) {
    setPaymentStatus(value);
    resetPage();
  }

  function changePage(page) {
    if (
      page < 1 ||
      (pagination.totalPages > 0 && page > pagination.totalPages)
    ) {
      return;
    }

    setPagination((current) => ({
      ...current,
      page,
    }));
  }

  // =========================
  // XEM CHI TIẾT ĐƠN HÀNG
  // =========================

  const openOrderDetail = useCallback(
    async (orderId) => {
      setSelectedOrder(null);
      setDetailError("");
      setDetailLoading(true);
      setActionError("");

      try {
        const result = await adminOrderService.getById(
          orderId,
          accessToken,
          onSessionUpdate
        );

        setSelectedOrder(result.data || null);
      } catch (err) {
        setDetailError(
          err.message || "Không thể tải chi tiết đơn hàng."
        );

        if (err.message?.includes("Phiên đăng nhập đã hết hạn")) {
          onSessionExpired?.();
        }
      } finally {
        setDetailLoading(false);
      }
    },
    [accessToken, onSessionExpired, onSessionUpdate]
  );

  function closeOrderDetail() {
    if (actionLoading) return;

    setSelectedOrder(null);
    setDetailError("");
    setActionError("");
  }

  // =========================
  // TẢI LẠI CHI TIẾT VÀ DANH SÁCH
  // =========================

  async function refreshOrderData(orderId) {
    await loadOrders();

    if (orderId) {
      try {
        const result = await adminOrderService.getById(
          orderId,
          accessToken,
          onSessionUpdate
        );

        setSelectedOrder(result.data || null);
      } catch (err) {
        setActionError(
          err.message || "Không thể cập nhật chi tiết đơn hàng."
        );

        if (err.message?.includes("Phiên đăng nhập đã hết hạn")) {
          onSessionExpired?.();
        }
      }
    }
  }

  // =========================
  // XÁC NHẬN THANH TOÁN COD
  // =========================

  async function handleMarkPaid() {
    if (!selectedOrder || actionLoading) return;

    const confirmed = window.confirm(
      `Xác nhận đã nhận đủ tiền COD của đơn ${selectedOrder.orderNumber}?`
    );

    if (!confirmed) return;

    setActionLoading(true);
    setActionError("");
    setNotice("");

    try {
      await adminOrderService.markPaid(
        selectedOrder.id,
        {},
        accessToken,
        onSessionUpdate
      );

      setNotice(
        `Đã xác nhận thanh toán đơn ${selectedOrder.orderNumber}.`
      );

      await refreshOrderData(selectedOrder.id);
    } catch (err) {
      setActionError(
        err.message || "Không thể xác nhận thanh toán."
      );

      if (err.message?.includes("Phiên đăng nhập đã hết hạn")) {
        onSessionExpired?.();
      }
    } finally {
      setActionLoading(false);
    }
  }

  // =========================
  // CẬP NHẬT TRẠNG THÁI ĐƠN
  // =========================

  async function handleUpdateStatus() {
    if (!selectedOrder || actionLoading) return;

    const nextStatus = getNextStatus(selectedOrder);

    if (!nextStatus) return;

    if (selectedOrder.payment?.status !== "PAID") {
      setActionError(
        "Đơn hàng phải được thanh toán trước khi cập nhật trạng thái."
      );
      return;
    }

    const actionLabel = STATUS_ACTION_LABELS[nextStatus];

    const confirmed = window.confirm(
      `${actionLabel} cho đơn ${selectedOrder.orderNumber}?`
    );

    if (!confirmed) return;

    setActionLoading(true);
    setActionError("");
    setNotice("");

    try {
      await adminOrderService.updateStatus(
        selectedOrder.id,
        {
          status: nextStatus,
        },
        accessToken,
        onSessionUpdate
      );

      setNotice(
        `Đã cập nhật trạng thái đơn ${selectedOrder.orderNumber}: ${ORDER_STATUSES[nextStatus].label}.`
      );

      await refreshOrderData(selectedOrder.id);
    } catch (err) {
      setActionError(
        err.message || "Không thể cập nhật trạng thái đơn hàng."
      );

      if (err.message?.includes("Phiên đăng nhập đã hết hạn")) {
        onSessionExpired?.();
      }
    } finally {
      setActionLoading(false);
    }
  }

  // =========================
  // HỦY ĐƠN HÀNG
  // =========================

  async function handleCancelOrder() {
    if (!selectedOrder || actionLoading) return;

    if (!canCancelOrder(selectedOrder)) {
      setActionError(
        "Không thể hủy đơn hàng ở trạng thái hiện tại."
      );
      return;
    }

    const confirmed = window.confirm(
      `Bạn có chắc chắn muốn hủy đơn ${selectedOrder.orderNumber}?`
    );

    if (!confirmed) return;

    setActionLoading(true);
    setActionError("");
    setNotice("");

    try {
      await adminOrderService.cancel(
        selectedOrder.id,
        {
          note: "Hủy đơn hàng bởi quản trị viên.",
        },
        accessToken,
        onSessionUpdate
      );

      setNotice(
        `Đã hủy đơn hàng ${selectedOrder.orderNumber}.`
      );

      await refreshOrderData(selectedOrder.id);
    } catch (err) {
      setActionError(
        err.message || "Không thể hủy đơn hàng."
      );

      if (err.message?.includes("Phiên đăng nhập đã hết hạn")) {
        onSessionExpired?.();
      }
    } finally {
      setActionLoading(false);
    }
  }

  // =========================
  // HIỂN THỊ
  // =========================

  return (
    <section className="catalog-page order-page">
      <div className="catalog-page-heading">
        <div>
          <span className="admin-eyebrow">ORDER MANAGEMENT</span>
          <h2>Quản lý đơn hàng</h2>
          <p>Theo dõi và xử lý các đơn hàng của cửa hàng.</p>
        </div>
      </div>

      {notice && (
        <div className="admin-alert admin-alert-success" role="status">
          {notice}
          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label="Đóng thông báo"
          >
            ×
          </button>
        </div>
      )}

      {error && (
        <div className="admin-alert admin-alert-error" role="alert">
          {error}
        </div>
      )}

      {/* BỘ LỌC */}

      <div className="catalog-toolbar order-toolbar">
        <form className="catalog-search" onSubmit={submitSearch}>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Tìm mã đơn, tên người nhận, số điện thoại..."
          />

          <button type="submit" disabled={loading}>
            Tìm kiếm
          </button>
        </form>

        <div className="order-filters">
          <select
            value={status}
            onChange={(event) => changeStatus(event.target.value)}
            aria-label="Lọc trạng thái đơn hàng"
          >
            <option value="all">Tất cả trạng thái đơn</option>
            {Object.entries(ORDER_STATUSES).map(([value, item]) => (
              <option key={value} value={value}>
                {item.label}
              </option>
            ))}
          </select>

          <select
            value={paymentMethod}
            onChange={(event) =>
              changePaymentMethod(event.target.value)
            }
            aria-label="Lọc phương thức thanh toán"
          >
            <option value="all">Tất cả phương thức</option>
            <option value="COD">COD</option>
            <option value="VNPAY">VNPay</option>
          </select>

          <select
            value={paymentStatus}
            onChange={(event) =>
              changePaymentStatus(event.target.value)
            }
            aria-label="Lọc trạng thái thanh toán"
          >
            <option value="all">Tất cả thanh toán</option>
            {Object.entries(PAYMENT_STATUSES).map(([value, item]) => (
              <option key={value} value={value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* BẢNG ĐƠN HÀNG */}

      <div className="catalog-table-card">
        <div className="order-table-heading">
          <div>
            <h3>Danh sách đơn hàng</h3>
            <span>
              {formatNumber(pagination.total)} đơn hàng
            </span>
          </div>

          <button
            type="button"
            className="order-refresh-button"
            onClick={loadOrders}
            disabled={loading}
          >
            {loading ? "Đang tải..." : "↻ Làm mới"}
          </button>
        </div>

        <div className="catalog-table-scroll">
          <table className="catalog-table order-table">
            <thead>
              <tr>
                <th>Mã đơn hàng</th>
                <th>Khách hàng</th>
                <th>Sản phẩm</th>
                <th>Ngày đặt</th>
                <th>Tổng tiền</th>
                <th>Thanh toán</th>
                <th>Trạng thái đơn</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8">
                    <div className="catalog-table-state">
                      <span className="catalog-spinner" />
                      <p>Đang tải danh sách đơn hàng...</p>
                    </div>
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan="8">
                    <div className="catalog-table-state">
                      <p>Không tìm thấy đơn hàng phù hợp.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const orderStatus = getOrderStatus(order.status);
                  const payment = getPaymentStatus(
                    order.payment?.status
                  );

                  return (
                    <tr key={order.id}>
                      <td>
                        <strong className="order-number">
                          {order.orderNumber || "—"}
                        </strong>
                      </td>

                      <td>
                        <div className="order-customer-cell">
                          <strong>{getCustomerName(order)}</strong>
                          <small>
                            {order.shippingPhone || order.user?.phone || "—"}
                          </small>
                        </div>
                      </td>

                      <td>{getOrderItemSummary(order)}</td>

                      <td>{formatDate(order.createdAt)}</td>

                      <td>
                        <strong>
                          {formatCurrency(order.totalAmount)}
                        </strong>
                      </td>

                      <td>
                        <div className="order-payment-cell">
                          <span>
                            {getPaymentMethodLabel(order.paymentMethod)}
                          </span>
                          <span
                            className={`order-status-badge ${payment.className}`}
                          >
                            {payment.label}
                          </span>
                        </div>
                      </td>

                      <td>
                        <span
                          className={`order-status-badge ${orderStatus.className}`}
                        >
                          {orderStatus.label}
                        </span>
                      </td>

                      <td>
                        <button
                          type="button"
                          className="order-detail-button"
                          onClick={() => openOrderDetail(order.id)}
                        >
                          Chi tiết
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PHÂN TRANG */}

        <div className="catalog-pagination">
          <span>
            Trang {pagination.page} / {Math.max(pagination.totalPages, 1)}
            {" · "}
            {formatNumber(pagination.total)} đơn hàng
          </span>

          <div>
            <button
              type="button"
              onClick={() => changePage(pagination.page - 1)}
              disabled={loading || pagination.page <= 1}
            >
              Trước
            </button>

            <button
              type="button"
              onClick={() => changePage(pagination.page + 1)}
              disabled={
                loading ||
                pagination.page >= pagination.totalPages
              }
            >
              Sau
            </button>
          </div>
        </div>
      </div>

      {/* MODAL CHI TIẾT */}

      {(detailLoading || selectedOrder || detailError) && (
        <div
          className="order-modal-overlay"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !actionLoading
            ) {
              closeOrderDetail();
            }
          }}
        >
          <section
            className="order-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-detail-title"
          >
            <div className="order-modal-header">
              <div>
                <span className="admin-eyebrow">ORDER DETAILS</span>
                <h2 id="order-detail-title">
                  {selectedOrder?.orderNumber || "Chi tiết đơn hàng"}
                </h2>
              </div>

              <button
                type="button"
                onClick={closeOrderDetail}
                disabled={actionLoading}
                aria-label="Đóng"
              >
                ×
              </button>
            </div>

            <div className="order-modal-body">
              {detailLoading ? (
                <div className="catalog-table-state">
                  <span className="catalog-spinner" />
                  <p>Đang tải chi tiết đơn hàng...</p>
                </div>
              ) : detailError ? (
                <div className="admin-alert admin-alert-error">
                  {detailError}
                </div>
              ) : selectedOrder ? (
                <>
                  {actionError && (
                    <div className="admin-alert admin-alert-error">
                      {actionError}
                    </div>
                  )}

                  {/* THÔNG TIN CHUNG */}

                  <div className="order-detail-section">
                    <h3>Thông tin đơn hàng</h3>

                    <div className="order-detail-grid">
                      <div>
                        <small>Mã đơn hàng</small>
                        <strong>{selectedOrder.orderNumber}</strong>
                      </div>

                      <div>
                        <small>Ngày đặt</small>
                        <strong>{formatDate(selectedOrder.createdAt)}</strong>
                      </div>

                      <div>
                        <small>Trạng thái đơn</small>
                        <strong>
                          {getOrderStatus(selectedOrder.status).label}
                        </strong>
                      </div>

                      <div>
                        <small>Phương thức thanh toán</small>
                        <strong>
                          {getPaymentMethodLabel(
                            selectedOrder.paymentMethod
                          )}
                        </strong>
                      </div>

                      <div>
                        <small>Trạng thái thanh toán</small>
                        <strong>
                          {getPaymentStatus(
                            selectedOrder.payment?.status
                          ).label}
                        </strong>
                      </div>

                      <div>
                        <small>Email khách hàng</small>
                        <strong>
                          {selectedOrder.user?.email || "—"}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* NGƯỜI NHẬN */}

                  <div className="order-detail-section">
                    <h3>Thông tin nhận hàng</h3>

                    <div className="order-detail-grid">
                      <div>
                        <small>Người nhận</small>
                        <strong>
                          {selectedOrder.shippingRecipientName || "—"}
                        </strong>
                      </div>

                      <div>
                        <small>Số điện thoại</small>
                        <strong>
                          {selectedOrder.shippingPhone || "—"}
                        </strong>
                      </div>

                      <div className="order-detail-full">
                        <small>Địa chỉ</small>
                        <strong>
                          {[
                            selectedOrder.shippingStreet,
                            selectedOrder.shippingDistrict,
                            selectedOrder.shippingProvinceCity,
                          ]
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </strong>
                      </div>

                      {selectedOrder.shippingAddressNote && (
                        <div className="order-detail-full">
                          <small>Ghi chú địa chỉ</small>
                          <strong>
                            {selectedOrder.shippingAddressNote}
                          </strong>
                        </div>
                      )}

                      {selectedOrder.customerNote && (
                        <div className="order-detail-full">
                          <small>Ghi chú khách hàng</small>
                          <strong>{selectedOrder.customerNote}</strong>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* SẢN PHẨM */}

                  <div className="order-detail-section">
                    <h3>Sản phẩm trong đơn</h3>

                    <div className="order-items-list">
                      {(selectedOrder.items || []).map((item) => (
                        <div
                          className="order-detail-item"
                          key={item.id}
                        >
                          <div>
                            <strong>{item.productName}</strong>
                            <small>
                              {item.variantName || "—"}
                              {item.sku ? ` · SKU: ${item.sku}` : ""}
                            </small>
                            <small>
                              {formatCurrency(item.unitPrice)}
                              {" × "}
                              {formatNumber(item.quantity)}
                            </small>
                          </div>

                          <strong>
                            {formatCurrency(item.lineTotal)}
                          </strong>
                        </div>
                      ))}

                      {(!selectedOrder.items ||
                        selectedOrder.items.length === 0) && (
                          <p>Không có sản phẩm trong đơn hàng.</p>
                        )}
                    </div>
                  </div>

                  {/* TỔNG TIỀN */}

                  <div className="order-detail-section">
                    <h3>Thanh toán</h3>

                    <div className="order-total-list">
                      <div>
                        <span>Tạm tính</span>
                        <strong>
                          {formatCurrency(selectedOrder.subtotal)}
                        </strong>
                      </div>

                      <div>
                        <span>Giảm giá</span>
                        <strong>
                          -{formatCurrency(selectedOrder.discountAmount)}
                        </strong>
                      </div>

                      <div>
                        <span>Phí vận chuyển</span>
                        <strong>
                          {formatCurrency(selectedOrder.shippingFee)}
                        </strong>
                      </div>

                      <div className="order-grand-total">
                        <span>Tổng thanh toán</span>
                        <strong>
                          {formatCurrency(selectedOrder.totalAmount)}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* LỊCH SỬ TRẠNG THÁI */}

                  <div className="order-detail-section">
                    <h3>Lịch sử trạng thái</h3>

                    <div className="order-history-list">
                      {(selectedOrder.statusHistory || []).map(
                        (history) => (
                          <div
                            className="order-history-item"
                            key={history.id}
                          >
                            <span className="order-history-dot" />

                            <div>
                              <strong>
                                {history.oldStatus
                                  ? getOrderStatus(history.oldStatus).label
                                  : "Khởi tạo"}
                                {" → "}
                                {getOrderStatus(history.newStatus).label}
                              </strong>

                              <small>{formatDate(history.createdAt)}</small>

                              {history.note && <p>{history.note}</p>}
                            </div>
                          </div>
                        )
                      )}

                      {(!selectedOrder.statusHistory ||
                        selectedOrder.statusHistory.length === 0) && (
                          <p>Chưa có lịch sử trạng thái.</p>
                        )}
                    </div>
                  </div>

                  {/* THAO TÁC */}

                  <div className="order-detail-actions">
                    {canMarkPaid(selectedOrder) && (
                      <button
                        type="button"
                        className="order-action-primary"
                        onClick={handleMarkPaid}
                        disabled={actionLoading}
                      >
                        {actionLoading
                          ? "Đang xử lý..."
                          : "Xác nhận đã thu tiền COD"}
                      </button>
                    )}

                    {getNextStatus(selectedOrder) &&
                      selectedOrder.payment?.status === "PAID" && (
                        <button
                          type="button"
                          className="order-action-primary"
                          onClick={handleUpdateStatus}
                          disabled={actionLoading}
                        >
                          {actionLoading
                            ? "Đang xử lý..."
                            : STATUS_ACTION_LABELS[
                            getNextStatus(selectedOrder)
                            ]}
                        </button>
                      )}

                    {canCancelOrder(selectedOrder) && (
                      <button
                        type="button"
                        className="order-action-danger"
                        onClick={handleCancelOrder}
                        disabled={actionLoading}
                      >
                        {actionLoading
                          ? "Đang xử lý..."
                          : "Hủy đơn hàng"}
                      </button>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
