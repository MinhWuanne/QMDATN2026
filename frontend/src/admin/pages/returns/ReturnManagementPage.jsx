import { useCallback, useEffect, useState } from "react";
import { adminReturnService } from "../../services/admin-return.service.js";
import "./admin-returns.css";

const STATUS_LABELS = {
  REQUESTED: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Đã từ chối",
  REFUND_PENDING: "Chờ hoàn tiền",
  WAITING_FOR_STOCK: "Chờ hàng đổi",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
};

const RESOLUTION_LABELS = {
  REFUND: "Hoàn tiền",
  EXCHANGE: "Đổi phiên bản",
};

function money(value) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function dateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
}

export default function ReturnManagementPage({
  accessToken,
  onSessionUpdate,
  onSessionExpired,
}) {
  const [requests, setRequests] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [status, setStatus] = useState("all");
  const [resolution, setResolution] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await adminReturnService.list({
        page: pagination.page,
        limit: pagination.limit,
        status: status === "all" ? undefined : status,
        resolution: resolution === "all" ? undefined : resolution,
        search: search || undefined,
      }, accessToken, onSessionUpdate);

      setRequests(Array.isArray(result.data) ? result.data : []);
      setPagination((current) => ({
        ...current,
        ...(result.pagination || {}),
      }));
    } catch (err) {
      setError(err.message || "Không thể tải danh sách yêu cầu.");
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
    status,
    resolution,
    search,
  ]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  async function openDetail(id) {
    setSelected(null);
    setDetailLoading(true);
    setError("");
    try {
      const result = await adminReturnService.getById(
        id,
        accessToken,
        onSessionUpdate
      );
      setSelected(result);
    } catch (err) {
      setError(err.message || "Không thể tải chi tiết yêu cầu.");
      if (err.message?.includes("Phiên đăng nhập đã hết hạn")) {
        onSessionExpired?.();
      }
    } finally {
      setDetailLoading(false);
    }
  }

  async function runAction(action, payload, successMessage) {
    if (!selected || actionLoading) return;
    setActionLoading(true);
    setError("");
    setNotice("");

    try {
      const updated = await adminReturnService[action](
        selected.id,
        payload,
        accessToken,
        onSessionUpdate
      );
      setSelected(updated);
      setNotice(successMessage);
      await loadRequests();
    } catch (err) {
      setError(err.message || "Không thể thực hiện thao tác.");
      if (err.message?.includes("Phiên đăng nhập đã hết hạn")) {
        onSessionExpired?.();
      }
    } finally {
      setActionLoading(false);
    }
  }

  function handleApprove() {
    if (!window.confirm("Duyệt yêu cầu đổi/trả này?")) return;
    runAction("approve", {}, "Đã duyệt yêu cầu.");
  }

  function handleReject() {
    const reason = window.prompt("Nhập lý do từ chối:");
    if (!reason || !reason.trim()) return;
    runAction("reject", { rejectionReason: reason.trim() }, "Đã từ chối yêu cầu.");
  }

  function handleReceive() {
    if (!window.confirm("Xác nhận đã nhận hàng hoàn? Tồn kho sẽ tăng ngay.")) return;
    const note = window.prompt("Ghi chú tình trạng hàng (không bắt buộc):") || "";
    runAction("receive", { conditionNote: note.trim() }, "Đã xác nhận nhận hàng và cập nhật tồn kho.");
  }

  function handleRefund() {
    const reference = window.prompt("Nhập mã giao dịch hoàn tiền đã thực hiện bên ngoài:");
    if (!reference || !reference.trim()) return;
    if (!window.confirm("Xác nhận khoản hoàn tiền này đã thực sự được chuyển cho khách?")) return;
    runAction(
      "confirmRefund",
      { refundReference: reference.trim() },
      "Đã ghi nhận hoàn tiền và hoàn tất yêu cầu."
    );
  }

  function handleRetryExchange() {
    if (!window.confirm("Thử tạo đơn hàng thay thế với tồn kho hiện tại?")) return;
    runAction("retryExchange", {}, "Đã tạo đơn hàng thay thế.");
  }

  function submitSearch(event) {
    event.preventDefault();
    setPagination((current) => ({ ...current, page: 1 }));
    setSearch(searchInput.trim());
  }

  const item = selected?.items?.[0];
  const orderItem = item?.orderItem;

  return (
    <section className="admin-returns-page">
      <div className="admin-returns-heading">
        <div>
          <span className="admin-eyebrow">AFTER-SALES MANAGEMENT</span>
          <h2>Đổi trả &amp; hoàn tiền</h2>
          <p>Tiếp nhận yêu cầu, cập nhật hàng hoàn, xác nhận hoàn tiền và xử lý đơn đổi.</p>
        </div>
        <button type="button" className="admin-returns-refresh" onClick={loadRequests} disabled={loading}>
          ↻ Tải lại
        </button>
      </div>

      {error && <div className="admin-alert admin-alert-error" role="alert">{error}</div>}
      {notice && <div className="admin-returns-notice" role="status">{notice}</div>}

      <div className="admin-returns-toolbar">
        <form onSubmit={submitSearch}>
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Tìm mã đơn, tên hoặc email khách hàng"
          />
          <button type="submit">Tìm kiếm</button>
        </form>
        <select value={status} onChange={(event) => {
          setStatus(event.target.value);
          setPagination((current) => ({ ...current, page: 1 }));
        }}>
          <option value="all">Tất cả trạng thái</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select value={resolution} onChange={(event) => {
          setResolution(event.target.value);
          setPagination((current) => ({ ...current, page: 1 }));
        }}>
          <option value="all">Tất cả loại yêu cầu</option>
          {Object.entries(RESOLUTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="admin-returns-layout">
        <div className="admin-returns-list">
          {loading ? (
            <div className="admin-returns-empty">Đang tải yêu cầu...</div>
          ) : requests.length === 0 ? (
            <div className="admin-returns-empty">Chưa có yêu cầu đổi/trả phù hợp.</div>
          ) : requests.map((request) => (
            <button
              type="button"
              key={request.id}
              className={"admin-return-row" + (selected?.id === request.id ? " active" : "")}
              onClick={() => openDetail(request.id)}
            >
              <span className="admin-return-row-top">
                <strong>{request.order?.orderNumber || "Đơn hàng"}</strong>
                <span className={"admin-return-status status-" + request.status.toLowerCase()}>
                  {STATUS_LABELS[request.status] || request.status}
                </span>
              </span>
              <span>{request.user?.fullName || request.user?.email || "Khách hàng"}</span>
              <span className="admin-return-row-bottom">
                <span>{RESOLUTION_LABELS[request.resolution] || request.resolution}</span>
                <time>{dateTime(request.createdAt)}</time>
              </span>
            </button>
          ))}
          <div className="admin-returns-pagination">
            <button
              type="button"
              disabled={pagination.page <= 1 || loading}
              onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))}
            >Trước</button>
            <span>{pagination.page} / {Math.max(1, pagination.totalPages)}</span>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))}
            >Sau</button>
          </div>
        </div>

        <div className="admin-returns-detail">
          {detailLoading ? (
            <div className="admin-returns-empty">Đang tải chi tiết...</div>
          ) : !selected ? (
            <div className="admin-returns-empty">
              <strong>Chọn một yêu cầu</strong>
              <span>Thông tin và thao tác xử lý sẽ hiển thị tại đây.</span>
            </div>
          ) : (
            <>
              <div className="admin-return-detail-heading">
                <div>
                  <span className="admin-eyebrow">RETURN REQUEST</span>
                  <h3>{selected.order?.orderNumber}</h3>
                  <p>Tạo lúc {dateTime(selected.createdAt)}</p>
                </div>
                <span className={"admin-return-status status-" + selected.status.toLowerCase()}>
                  {STATUS_LABELS[selected.status] || selected.status}
                </span>
              </div>

              <div className="admin-return-detail-grid">
                <div><small>Khách hàng</small><strong>{selected.user?.fullName || "—"}</strong><span>{selected.user?.email || "—"}</span></div>
                <div><small>Loại yêu cầu</small><strong>{RESOLUTION_LABELS[selected.resolution]}</strong><span>{selected.type}</span></div>
                <div><small>Số tiền hoàn dự kiến</small><strong>{selected.refundAmount ? money(selected.refundAmount) : "Không áp dụng"}</strong><span>Không bao gồm phí vận chuyển</span></div>
                <div><small>Ngày giao hàng</small><strong>{dateTime(selected.order?.deliveredAt)}</strong><span>Thời hạn yêu cầu: 3 ngày</span></div>
              </div>

              <div className="admin-return-product">
                <h4>Sản phẩm yêu cầu</h4>
                <strong>{orderItem?.productName || "—"}</strong>
                <span>{orderItem?.variantName || "—"} · SKU {orderItem?.sku || "—"}</span>
                <p>Đã mua: {orderItem?.quantity || 0} · Yêu cầu: {item?.quantity || 0}</p>
                {selected.resolution === "EXCHANGE" && (
                  <p>Đổi sang: {item?.exchangeVariant?.name || item?.exchangeVariant?.sku || "Phiên bản đã chọn"} · SL {item?.exchangeQuantity || 0}</p>
                )}
              </div>

              <div className="admin-return-reason">
                <h4>Lý do khách hàng</h4>
                <p>{selected.reason}</p>
                {selected.customerNote && <p>{selected.customerNote}</p>}
                {selected.adminNote && <p className="admin-return-admin-note">Ghi chú Admin: {selected.adminNote}</p>}
                {selected.refundReference && <p>Mã hoàn tiền: <strong>{selected.refundReference}</strong></p>}
                {selected.replacementOrder && <p>Đơn thay thế: <strong>{selected.replacementOrder.orderNumber}</strong> · {selected.replacementOrder.status}</p>}
              </div>

              <div className="admin-return-actions">
                {selected.status === "REQUESTED" && (
                  <>
                    <button type="button" onClick={handleApprove} disabled={actionLoading}>Duyệt yêu cầu</button>
                    <button type="button" className="danger" onClick={handleReject} disabled={actionLoading}>Từ chối</button>
                  </>
                )}
                {selected.status === "APPROVED" && (
                  <button type="button" onClick={handleReceive} disabled={actionLoading}>Xác nhận đã nhận hàng</button>
                )}
                {selected.status === "REFUND_PENDING" && (
                  <button type="button" onClick={handleRefund} disabled={actionLoading}>Xác nhận đã hoàn tiền</button>
                )}
                {selected.status === "WAITING_FOR_STOCK" && selected.resolution === "EXCHANGE" && (
                  <button type="button" onClick={handleRetryExchange} disabled={actionLoading}>Thử tạo đơn đổi hàng</button>
                )}
                {actionLoading && <span>Đang xử lý...</span>}
                {["COMPLETED", "REJECTED", "CANCELLED"].includes(selected.status) && (
                  <span className="admin-return-terminal">Yêu cầu đã kết thúc.</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}