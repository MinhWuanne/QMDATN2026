
import { useCallback, useEffect, useState } from "react";
import { getMemberOrders } from "../../services/order.service";
import "./orders.css";

const STATUS_OPTIONS = [
  { value: "", label: "Tất cả đơn hàng" },
  { value: "PENDING_CONFIRMATION", label: "Chờ xác nhận" },
  { value: "CONFIRMED", label: "Đã xác nhận" },
  { value: "PROCESSING", label: "Đang xử lý" },
  { value: "SHIPPING", label: "Đang giao hàng" },
  { value: "DELIVERED", label: "Đã giao hàng" },
  { value: "COMPLETED", label: "Hoàn thành" },
  { value: "CANCELLED", label: "Đã hủy" },
];

const STATUS_LABELS = Object.fromEntries(
  STATUS_OPTIONS.filter((item) => item.value).map((item) => [
    item.value,
    item.label,
  ])
);

function formatMoney(value) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return "—";

  return new Date(value).toLocaleString("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function MyOrdersPage({
  accessToken,
  onNavigate,
  onSessionRefresh,
  onSessionExpired,
}) {
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadOrders = useCallback(
    async (page = 1, selectedStatus = status) => {
      setLoading(true);
      setError("");

      try {
        const result = await getMemberOrders({
          accessToken,
          onSessionRefresh,
          onSessionExpired,
          page,
          limit: 20,
          status: selectedStatus || undefined,
        });

        setOrders(Array.isArray(result.data) ? result.data : []);
        setPagination(
          result.pagination || {
            page,
            limit: 20,
            total: 0,
            totalPages: 1,
          }
        );
      } catch (err) {
        setError(err.message || "Không thể tải danh sách đơn hàng.");
      } finally {
        setLoading(false);
      }
    },
    [accessToken, onSessionRefresh, onSessionExpired, status]
  );

  useEffect(() => {
    loadOrders(1, status);
  }, [loadOrders, status]);

  return (
    <main className="customer-orders-page">
      <div className="customer-orders-container">
        <div className="customer-orders-heading">
          <div>
            <span className="customer-orders-eyebrow">TÀI KHOẢN</span>
            <h1>Đơn hàng của tôi</h1>
            <p>Theo dõi và quản lý các đơn hàng bạn đã đặt.</p>
          </div>

          <button
            type="button"
            className="orders-back-button"
            onClick={() => onNavigate("/")}
          >
            Tiếp tục mua sắm
          </button>
        </div>

        <div className="orders-toolbar">
          <label htmlFor="orders-status-filter">
            Trạng thái đơn hàng
          </label>

          <select
            id="orders-status-filter"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {STATUS_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>

          <span className="orders-total">
            {pagination.total || 0} đơn hàng
          </span>
        </div>

        {loading ? (
          <div className="orders-state">Đang tải đơn hàng...</div>
        ) : error ? (
          <div className="orders-state orders-error">
            <p>{error}</p>
            <button type="button" onClick={() => loadOrders(1, status)}>
              Thử lại
            </button>
          </div>
        ) : orders.length === 0 ? (
          <div className="orders-empty">
            <div className="orders-empty-icon">□</div>
            <h2>Chưa có đơn hàng</h2>
            <p>
              {status
                ? "Không tìm thấy đơn hàng với trạng thái này."
                : "Các đơn hàng bạn đặt sẽ được hiển thị tại đây."}
            </p>
            <button type="button" onClick={() => onNavigate("/")}>
              Khám phá sản phẩm
            </button>
          </div>
        ) : (
          <>
            <div className="orders-list">
              {orders.map((order) => {
                const payment = order.payment;
                const itemCount = (order.items || []).reduce(
                  (sum, item) => sum + Number(item.quantity || 0),
                  0
                );

                return (
                  <article className="orders-card" key={order.id}>
                    <div className="orders-card-header">
                      <div>
                        <span className="orders-muted">Mã đơn hàng</span>
                        <strong>{order.orderNumber || order.id}</strong>
                      </div>

                      <span
                        className={`orders-status orders-status-${String(
                          order.status
                        ).toLowerCase()}`}
                      >
                        {STATUS_LABELS[order.status] || order.status}
                      </span>
                    </div>

                    <div className="orders-card-body">
                      <div className="orders-item-preview">
                        {(order.items || []).slice(0, 3).map((item) => (
                          <div
                            className="orders-item-line"
                            key={item.id}
                          >
                            <div>
                              <strong>{item.productName}</strong>
                              <span>
                                {item.variantName || item.sku || ""}
                                {" · "}x{item.quantity}
                              </span>
                            </div>
                            <span>{formatMoney(item.lineTotal)}</span>
                          </div>
                        ))}

                        {(order.items || []).length > 3 && (
                          <span className="orders-more-items">
                            Và {(order.items || []).length - 3} sản phẩm khác
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="orders-card-footer">
                      <div className="orders-summary">
                        <span>
                          {itemCount} sản phẩm · {formatDate(order.createdAt)}
                        </span>
                        <strong>{formatMoney(order.totalAmount)}</strong>
                        <small>
                          {order.paymentMethod || "—"}
                          {payment?.status
                            ? ` · ${payment.status}`
                            : ""}
                        </small>
                      </div>

                      <button
                        type="button"
                        className="orders-detail-button"
                        onClick={() => onNavigate(`/orders/${order.id}`)}
                      >
                        Xem chi tiết
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="orders-pagination">
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => loadOrders(pagination.page - 1, status)}
              >
                Trang trước
              </button>

              <span>
                Trang {pagination.page} / {pagination.totalPages || 1}
              </span>

              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => loadOrders(pagination.page + 1, status)}
              >
                Trang sau
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
