
import { useCallback, useEffect, useState } from "react";
import {
  cancelMemberOrder,
  getMemberOrderDetail,
  startMemberCheckout,
} from "../../services/order.service";
import "./orders.css";

const STATUS_LABELS = {
  PENDING_CONFIRMATION: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  PROCESSING: "Đang xử lý",
  SHIPPING: "Đang giao hàng",
  DELIVERED: "Đã giao hàng",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
};

const PAYMENT_LABELS = {
  PENDING: "Chờ thanh toán",
  PAID: "Đã thanh toán",
  FAILED: "Thanh toán thất bại",
  CANCELLED: "Đã hủy thanh toán",
  REFUNDED: "Đã hoàn tiền",
  PARTIALLY_REFUNDED: "Đã hoàn tiền một phần",
};

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

export default function OrderDetailPage({
  orderId,
  accessToken,
  onNavigate,
  onSessionRefresh,
  onSessionExpired,
}) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");

  const loadOrder = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await getMemberOrderDetail({
        orderId,
        accessToken,
        onSessionRefresh,
        onSessionExpired,
      });

      setOrder(result);
    } catch (err) {
      setError(err.message || "Không thể tải thông tin đơn hàng.");
    } finally {
      setLoading(false);
    }
  }, [
    orderId,
    accessToken,
    onSessionRefresh,
    onSessionExpired,
  ]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  async function handleContinuePayment() {
    if (!order || actionLoading) return;

    setActionLoading(true);
    setActionError("");

    try {
      const result = await startMemberCheckout({
        orderId: order.id,
        accessToken,
        onSessionRefresh,
        onSessionExpired,
      });

      if (!result.paymentUrl) {
        throw new Error("Không nhận được đường dẫn thanh toán.");
      }

      window.location.assign(result.paymentUrl);
    } catch (err) {
      setActionError(
        err.message || "Không thể tiếp tục thanh toán."
      );
      setActionLoading(false);
      await loadOrder();
    }
  }

  async function handleCancelOrder() {
    if (!order || actionLoading) return;

    const confirmed = window.confirm(
      "Bạn có chắc chắn muốn hủy đơn hàng này không?"
    );

    if (!confirmed) return;

    setActionLoading(true);
    setActionError("");

    try {
      const updatedOrder = await cancelMemberOrder({
        orderId: order.id,
        note: "Customer cancelled order",
        accessToken,
        onSessionRefresh,
        onSessionExpired,
      });

      setOrder(updatedOrder);
    } catch (err) {
      setActionError(
        err.message || "Không thể hủy đơn hàng."
      );
      await loadOrder();
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <main className="customer-orders-page">
        <div className="orders-state">Đang tải chi tiết đơn hàng...</div>
      </main>
    );
  }

  if (error || !order) {
    return (
      <main className="customer-orders-page">
        <div className="orders-state orders-error">
          <p>{error || "Không tìm thấy đơn hàng."}</p>
          <button type="button" onClick={() => onNavigate("/orders")}>
            Quay lại đơn hàng
          </button>
        </div>
      </main>
    );
  }

  const payment = order.payment;
  const isPendingVnpay =
    order.paymentMethod === "VNPAY" &&
    order.status === "PENDING_CONFIRMATION" &&
    payment?.status === "PENDING";

  const isCancellable =
    payment?.status !== "PAID" &&
    (
      order.paymentMethod === "COD" &&
      [
        "PENDING_CONFIRMATION",
        "CONFIRMED",
        "PROCESSING",
        "SHIPPING",
      ].includes(order.status)
      ||
      order.paymentMethod === "VNPAY" &&
      order.status === "PENDING_CONFIRMATION" &&
      ["PENDING", "FAILED"].includes(payment?.status)
    );

  const history = [...(order.statusHistory || [])].reverse();

  return (
    <main className="customer-orders-page">
      <div className="customer-orders-container">
        <button
          type="button"
          className="orders-text-back"
          onClick={() => onNavigate("/orders")}
        >
          ← Quay lại đơn hàng
        </button>

        <div className="customer-orders-heading">
          <div>
            <span className="customer-orders-eyebrow">CHI TIẾT ĐƠN HÀNG</span>
            <h1>{order.orderNumber || order.id}</h1>
            <p>Ngày đặt: {formatDate(order.createdAt)}</p>
          </div>

          <span
            className={`orders-status orders-status-${String(
              order.status
            ).toLowerCase()}`}
          >
            {STATUS_LABELS[order.status] || order.status}
          </span>
        </div>

        {actionError && (
          <div className="orders-action-error">{actionError}</div>
        )}

        <section className="orders-detail-section">
          <h2>Sản phẩm đã đặt</h2>

          {(order.items || []).map((item) => (
            <div className="orders-detail-item" key={item.id}>
              <div>
                <strong>{item.productName}</strong>
                <span>
                  {item.variantName || item.sku || "Phân loại mặc định"}
                </span>
                <small>Số lượng: {item.quantity}</small>
              </div>

              <strong>{formatMoney(item.lineTotal)}</strong>
            </div>
          ))}
        </section>

        <section className="orders-detail-section">
          <h2>Thông tin nhận hàng</h2>

          <div className="orders-info-grid">
            <div>
              <span>Người nhận</span>
              <strong>{order.shippingRecipientName || "—"}</strong>
            </div>
            <div>
              <span>Số điện thoại</span>
              <strong>{order.shippingPhone || "—"}</strong>
            </div>
            <div className="orders-info-full">
              <span>Địa chỉ</span>
              <strong>
                {[
                  order.shippingStreet,
                  order.shippingDistrict,
                  order.shippingProvinceCity,
                ]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </strong>
            </div>
            {order.shippingAddressNote && (
              <div className="orders-info-full">
                <span>Ghi chú địa chỉ</span>
                <strong>{order.shippingAddressNote}</strong>
              </div>
            )}
            {order.customerNote && (
              <div className="orders-info-full">
                <span>Ghi chú đơn hàng</span>
                <strong>{order.customerNote}</strong>
              </div>
            )}
          </div>
        </section>

        <section className="orders-detail-section">
          <h2>Thanh toán</h2>

          <div className="orders-price-row">
            <span>Tạm tính</span>
            <strong>{formatMoney(order.subtotal)}</strong>
          </div>
          <div className="orders-price-row">
            <span>Giảm giá</span>
            <strong>-{formatMoney(order.discountAmount)}</strong>
          </div>
          <div className="orders-price-row">
            <span>Phí vận chuyển</span>
            <strong>{formatMoney(order.shippingFee)}</strong>
          </div>
          <div className="orders-price-row orders-grand-total">
            <span>Tổng thanh toán</span>
            <strong>{formatMoney(order.totalAmount)}</strong>
          </div>

          <div className="orders-payment-meta">
            <span>Phương thức: {order.paymentMethod || "—"}</span>
            <span>
              Trạng thái:{" "}
              {PAYMENT_LABELS[payment?.status] || payment?.status || "—"}
            </span>
          </div>
        </section>

        <section className="orders-detail-section">
          <h2>Lịch sử đơn hàng</h2>

          {history.length === 0 ? (
            <p className="orders-muted">Chưa có lịch sử trạng thái.</p>
          ) : (
            <div className="orders-history">
              {history.map((entry) => (
                <div className="orders-history-item" key={entry.id}>
                  <span className="orders-history-dot" />
                  <div>
                    <strong>
                      {STATUS_LABELS[entry.newStatus] || entry.newStatus}
                    </strong>
                    <span>{formatDate(entry.createdAt)}</span>
                    {entry.note && <p>{entry.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="orders-detail-actions">
          {isPendingVnpay && (
            <button
              type="button"
              className="orders-primary-action"
              disabled={actionLoading}
              onClick={handleContinuePayment}
            >
              {actionLoading ? "Đang xử lý..." : "Tiếp tục thanh toán"}
            </button>
          )}

          {isCancellable && (
            <button
              type="button"
              className="orders-danger-action"
              disabled={actionLoading}
              onClick={handleCancelOrder}
            >
              {actionLoading ? "Đang xử lý..." : "Hủy đơn hàng"}
            </button>
          )}

          <button
            type="button"
            className="orders-secondary-action"
            onClick={() => onNavigate("/orders")}
          >
            Danh sách đơn hàng
          </button>
        </div>
      </div>
    </main>
  );
}
