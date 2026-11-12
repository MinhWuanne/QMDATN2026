
import { useCallback, useEffect, useState } from "react";
import { adminMemberService } from "../../services/admin-member.service.js";

// ==========================================
// CONSTANTS & FORMATTERS
// ==========================================

const DEFAULT_PAGINATION = {
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 0,
};

const STATUS_LABELS = {
  ACTIVE: "Đang hoạt động",
  LOCKED: "Đã khóa",
  PENDING_VERIFICATION: "Chờ xác minh",
};

const ORDER_STATUS_LABELS = {
  PENDING_CONFIRMATION: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  PROCESSING: "Đang xử lý",
  SHIPPING: "Đang giao",
  DELIVERED: "Đã giao",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
};

const PAYMENT_STATUS_LABELS = {
  PENDING: "Chờ thanh toán",
  PAID: "Đã thanh toán",
  FAILED: "Thanh toán thất bại",
  CANCELLED: "Đã hủy",
  REFUNDED: "Đã hoàn tiền",
  PARTIALLY_REFUNDED: "Hoàn tiền một phần",
};

function formatCurrency(value) {
  const amount = Number(value ?? 0);

  if (!Number.isFinite(amount)) return "0 ₫";

  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getStatusClass(status) {
  switch (status) {
    case "ACTIVE":
      return "is-active";
    case "LOCKED":
      return "is-locked";
    case "PENDING_VERIFICATION":
      return "is-pending";
    default:
      return "";
  }
}

function isSessionExpired(error) {
  return error?.message?.includes("Phiên đăng nhập đã hết hạn");
}

// ==========================================
// COMPONENT
// ==========================================

export default function MemberManagementPage({
  accessToken,
  onSessionUpdate,
  onSessionExpired,
}) {
  // ----------------------------------------
  // LIST & FILTER
  // ----------------------------------------

  const [members, setMembers] = useState([]);
  const [pagination, setPagination] = useState({
    ...DEFAULT_PAGINATION,
  });

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // ----------------------------------------
  // OVERVIEW STATS
  // ----------------------------------------

  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // ----------------------------------------
  // MEMBER DETAIL
  // ----------------------------------------

  const [selectedMember, setSelectedMember] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  // ----------------------------------------
  // STATUS UPDATE
  // ----------------------------------------

  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState(null);
  const [statusReason, setStatusReason] = useState("");
  const [statusSaving, setStatusSaving] = useState(false);

  // ==========================================
  // LOAD MEMBERS
  // ==========================================

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await adminMemberService.list(
        {
          page: pagination.page,
          limit: pagination.limit,
          search: search || undefined,
          status:
            statusFilter === "all" ? undefined : statusFilter,
        },
        accessToken,
        onSessionUpdate
      );

      setMembers(Array.isArray(result.items) ? result.items : []);

      setPagination((current) => ({
        ...current,
        ...(result.pagination || {}),
      }));
    } catch (err) {
      setError(err.message || "Không thể tải danh sách thành viên.");

      if (isSessionExpired(err)) {
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
    statusFilter,
  ]);

  // ==========================================
  // LOAD OVERVIEW STATS
  // ==========================================

  const loadStats = useCallback(async () => {
    setStatsLoading(true);

    try {
      const result = await adminMemberService.getStats(
        accessToken,
        onSessionUpdate
      );

      setStats(result.data || null);
    } catch (err) {
      setError(err.message || "Không thể tải thống kê thành viên.");

      if (isSessionExpired(err)) {
        onSessionExpired?.();
      }
    } finally {
      setStatsLoading(false);
    }
  }, [accessToken, onSessionExpired, onSessionUpdate]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // ==========================================
  // SEARCH & FILTER
  // ==========================================

  function handleSearch(event) {
    event.preventDefault();

    setPagination((current) => ({
      ...current,
      page: 1,
    }));

    setSearch(searchInput.trim());
  }

  function handleStatusFilter(value) {
    setStatusFilter(value);

    setPagination((current) => ({
      ...current,
      page: 1,
    }));
  }

  function changePage(page) {
    if (
      page < 1 ||
      page > pagination.totalPages ||
      page === pagination.page
    ) {
      return;
    }

    setPagination((current) => ({
      ...current,
      page,
    }));
  }

  // ==========================================
  // MEMBER DETAIL
  // ==========================================

  async function openMemberDetail(member) {
    setSelectedMember(null);
    setDetailError("");
    setDetailLoading(true);

    try {
      const result = await adminMemberService.getById(
        member.id,
        accessToken,
        onSessionUpdate
      );

      setSelectedMember(result.data || null);
    } catch (err) {
      setDetailError(err.message || "Không thể tải thông tin thành viên.");

      if (isSessionExpired(err)) {
        onSessionExpired?.();
      }
    } finally {
      setDetailLoading(false);
    }
  }

  function closeMemberDetail() {
    if (statusSaving) return;

    setSelectedMember(null);
    setDetailError("");
  }

  // ==========================================
  // OPEN STATUS MODAL
  // ==========================================

  function openStatusModal(member) {
    if (
      !member ||
      !["ACTIVE", "LOCKED"].includes(member.status)
    ) {
      return;
    }

    setStatusTarget(member);
    setStatusReason("");
    setStatusModalOpen(true);
  }

  function closeStatusModal() {
    if (statusSaving) return;

    setStatusModalOpen(false);
    setStatusTarget(null);
    setStatusReason("");
  }

  // ==========================================
  // UPDATE MEMBER STATUS
  // ==========================================

  async function handleUpdateStatus(event) {
    event.preventDefault();

    if (!statusTarget || statusSaving) return;

    const newStatus =
      statusTarget.status === "ACTIVE" ? "LOCKED" : "ACTIVE";

    const reason = statusReason.trim();

    if (!reason) {
      setError("Vui lòng nhập lý do thay đổi trạng thái.");
      return;
    }

    setStatusSaving(true);
    setError("");
    setNotice("");

    try {
      await adminMemberService.updateStatus(
        statusTarget.id,
        {
          status: newStatus,
          reason,
        },
        accessToken,
        onSessionUpdate
      );

      setNotice(
        newStatus === "LOCKED"
          ? "Đã khóa tài khoản thành viên."
          : "Đã mở khóa tài khoản thành viên."
      );

      setStatusModalOpen(false);
      setStatusTarget(null);
      setStatusReason("");

      // Refresh list and overview statistics.
      await Promise.all([
        loadMembers(),
        loadStats(),
      ]);

      // Refresh detail if the member detail modal is open.
      if (selectedMember?.id === statusTarget.id) {
        const result = await adminMemberService.getById(
          statusTarget.id,
          accessToken,
          onSessionUpdate
        );

        setSelectedMember(result.data || null);
      }
    } catch (err) {
      setError(err.message || "Không thể thay đổi trạng thái thành viên.");

      if (isSessionExpired(err)) {
        onSessionExpired?.();
      }
    } finally {
      setStatusSaving(false);
    }
  }

  // ==========================================
  // PAGINATION DISPLAY
  // ==========================================

  const pageCount = pagination.totalPages || 0;

  const start =
    pagination.total === 0
      ? 0
      : (pagination.page - 1) * pagination.limit + 1;

  const end = Math.min(
    pagination.page * pagination.limit,
    pagination.total
  );

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <section className="member-page">
      {/* PAGE HEADER */}
      <div className="member-page-heading">
        <div>
          <span className="admin-eyebrow">
            CUSTOMER MANAGEMENT
          </span>

          <h2>Quản lý thành viên</h2>

          <p>
            Theo dõi thông tin tài khoản và hoạt động mua hàng
            của khách hàng.
          </p>
        </div>

        <button
          type="button"
          className="catalog-secondary-button"
          onClick={() => {
            loadMembers();
            loadStats();
          }}
          disabled={loading || statsLoading}
        >
          Làm mới dữ liệu
        </button>
      </div>

      {/* GLOBAL ERROR */}
      {error && (
        <div className="admin-alert admin-alert-error" role="alert">
          {error}
        </div>
      )}

      {/* NOTICE */}
      {notice && (
        <div className="catalog-notice" role="status">
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

      {/* ================================== */}
      {/* OVERVIEW STATS */}
      {/* ================================== */}

      <div className="member-stats-section">
        <div className="member-section-heading">
          <h3>Tổng quan thành viên</h3>
        </div>

        {statsLoading && !stats ? (
          <div className="catalog-table-state">
            <span className="catalog-spinner" />
            <span>Đang tải thống kê...</span>
          </div>
        ) : (
          <div className="member-stats-grid">
            <article className="member-stat-card">
              <span className="member-stat-label">
                Tổng thành viên
              </span>

              <strong className="member-stat-value">
                {stats?.totalCustomers ?? 0}
              </strong>

              <span className="member-stat-description">
                Tất cả tài khoản khách hàng
              </span>
            </article>

            <article className="member-stat-card is-active">
              <span className="member-stat-label">
                Đang hoạt động
              </span>

              <strong className="member-stat-value">
                {stats?.statusCounts?.ACTIVE ?? 0}
              </strong>

              <span className="member-stat-description">
                Tài khoản có thể mua hàng
              </span>
            </article>

            <article className="member-stat-card is-locked">
              <span className="member-stat-label">
                Đã khóa
              </span>

              <strong className="member-stat-value">
                {stats?.statusCounts?.LOCKED ?? 0}
              </strong>

              <span className="member-stat-description">
                Tài khoản bị hạn chế
              </span>
            </article>

            <article className="member-stat-card is-pending">
              <span className="member-stat-label">
                Chờ xác minh
              </span>

              <strong className="member-stat-value">
                {stats?.statusCounts?.PENDING_VERIFICATION ?? 0}
              </strong>

              <span className="member-stat-description">
                Chưa hoàn tất xác minh
              </span>
            </article>

            <article className="member-stat-card">
              <span className="member-stat-label">
                Khách đã mua hàng
              </span>

              <strong className="member-stat-value">
                {stats?.customersWithPurchases ?? 0}
              </strong>

              <span className="member-stat-description">
                Có ít nhất một đơn thành công
              </span>
            </article>

            <article className="member-stat-card">
              <span className="member-stat-label">
                Tỷ lệ mua lại
              </span>

              <strong className="member-stat-value">
                {Number(stats?.repeatPurchaseRate ?? 0).toLocaleString(
                  "vi-VN"
                )}
                %
              </strong>

              <span className="member-stat-description">
                Trong nhóm khách đã mua hàng
              </span>
            </article>

            <article className="member-stat-card">
              <span className="member-stat-label">
                Đơn hàng thành công
              </span>

              <strong className="member-stat-value">
                {stats?.completedOrderCount ?? 0}
              </strong>

              <span className="member-stat-description">
                Đã hoàn thành và thanh toán
              </span>
            </article>

            <article className="member-stat-card">
              <span className="member-stat-label">
                Tổng chi tiêu
              </span>

              <strong className="member-stat-value member-stat-money">
                {formatCurrency(stats?.totalSpend)}
              </strong>

              <span className="member-stat-description">
                Từ các đơn hàng thành công
              </span>
            </article>
          </div>
        )}
      </div>

      {/* ================================== */}
      {/* MEMBER LIST */}
      {/* ================================== */}

      <div className="catalog-table-card member-list-card">
        <div className="catalog-table-heading">
          <div>
            <h3>Danh sách thành viên</h3>

            <p>
              {pagination.total} thành viên
            </p>
          </div>
        </div>

        {/* TOOLBAR */}
        <div className="catalog-toolbar">
          <form
            className="catalog-search"
            onSubmit={handleSearch}
          >
            <span aria-hidden="true">⌕</span>

            <input
              type="text"
              value={searchInput}
              onChange={(event) =>
                setSearchInput(event.target.value)
              }
              placeholder="Tìm theo tên, email hoặc số điện thoại..."
              aria-label="Tìm thành viên"
            />

            <button type="submit">
              Tìm kiếm
            </button>
          </form>

          <select
            className="catalog-status-filter"
            value={statusFilter}
            onChange={(event) =>
              handleStatusFilter(event.target.value)
            }
            aria-label="Lọc trạng thái thành viên"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="ACTIVE">Đang hoạt động</option>
            <option value="LOCKED">Đã khóa</option>
            <option value="PENDING_VERIFICATION">
              Chờ xác minh
            </option>
          </select>
        </div>

        {/* TABLE */}
        <div className="catalog-table-scroll">
          <table className="catalog-table member-table">
            <thead>
              <tr>
                <th>Thành viên</th>
                <th>Liên hệ</th>
                <th>Trạng thái</th>
                <th>Ngày tham gia</th>
                <th className="member-number-cell">
                  Số đơn thành công
                </th>
                <th className="member-number-cell">
                  Tổng chi tiêu
                </th>
                <th>Thao tác</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7}>
                    <div className="catalog-table-state">
                      <span className="catalog-spinner" />
                      <span>Đang tải danh sách thành viên...</span>
                    </div>
                  </td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="catalog-table-state">
                      Không tìm thấy thành viên phù hợp.
                    </div>
                  </td>
                </tr>
              ) : (
                members.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <div className="member-name-cell">
                        <strong>
                          {member.fullName || "Chưa cập nhật"}
                        </strong>

                        <span>{member.email}</span>
                      </div>
                    </td>

                    <td>
                      {member.phone || "Chưa có số điện thoại"}
                    </td>

                    <td>
                      <span
                        className={`catalog-status ${getStatusClass(
                          member.status
                        )}`}
                      >
                        {STATUS_LABELS[member.status] ||
                          member.status}
                      </span>
                    </td>

                    <td>{formatDate(member.createdAt)}</td>

                    <td className="member-number-cell">
                      {member.purchaseCount ?? 0}
                    </td>

                    <td className="member-number-cell">
                      {formatCurrency(member.totalSpend)}
                    </td>

                    <td>
                      <div className="catalog-row-actions">
                        <button
                          type="button"
                          onClick={() => openMemberDetail(member)}
                        >
                          Chi tiết
                        </button>

                        {member.status === "ACTIVE" && (
                          <button
                            type="button"
                            className="is-danger"
                            onClick={() => openStatusModal(member)}
                          >
                            Khóa
                          </button>
                        )}

                        {member.status === "LOCKED" && (
                          <button
                            type="button"
                            onClick={() => openStatusModal(member)}
                          >
                            Mở khóa
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

        {/* PAGINATION */}
        <div className="catalog-pagination">
          <span>
            Hiển thị {start}–{end} trong tổng số{" "}
            {pagination.total} thành viên
          </span>

          <div>
            <button
              type="button"
              onClick={() => changePage(pagination.page - 1)}
              disabled={loading || pagination.page <= 1}
            >
              Trước
            </button>

            <span>
              Trang {pagination.page} / {pageCount || 1}
            </span>

            <button
              type="button"
              onClick={() => changePage(pagination.page + 1)}
              disabled={
                loading ||
                pagination.page >= pageCount ||
                pageCount === 0
              }
            >
              Sau
            </button>
          </div>
        </div>
      </div>

      {/* ================================== */}
      {/* MEMBER DETAIL MODAL */}
      {/* ================================== */}

      {(detailLoading || selectedMember || detailError) && (
        <div
          className="catalog-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeMemberDetail();
            }
          }}
        >
          <section
            className="catalog-modal member-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="member-detail-title"
          >
            <div className="catalog-modal-heading">
              <div>
                <span className="admin-eyebrow">
                  MEMBER PROFILE
                </span>

                <h2 id="member-detail-title">
                  Chi tiết thành viên
                </h2>
              </div>

              <button
                type="button"
                onClick={closeMemberDetail}
                aria-label="Đóng"
                disabled={statusSaving}
              >
                ×
              </button>
            </div>

            {detailLoading ? (
              <div className="catalog-table-state">
                <span className="catalog-spinner" />
                <span>Đang tải thông tin thành viên...</span>
              </div>
            ) : detailError ? (
              <div className="admin-alert admin-alert-error">
                {detailError}
              </div>
            ) : selectedMember ? (
              <div className="member-detail-body">
                {/* PROFILE */}
                <section className="member-detail-section">
                  <div className="member-detail-heading">
                    <h3>Thông tin tài khoản</h3>

                    <span
                      className={`catalog-status ${getStatusClass(
                        selectedMember.status
                      )}`}
                    >
                      {STATUS_LABELS[selectedMember.status] ||
                        selectedMember.status}
                    </span>
                  </div>

                  <div className="member-profile-grid">
                    <div>
                      <span>Họ và tên</span>
                      <strong>
                        {selectedMember.fullName || "—"}
                      </strong>
                    </div>

                    <div>
                      <span>Email</span>
                      <strong>{selectedMember.email}</strong>
                    </div>

                    <div>
                      <span>Số điện thoại</span>
                      <strong>{selectedMember.phone || "—"}</strong>
                    </div>

                    <div>
                      <span>Ngày tham gia</span>
                      <strong>
                        {formatDateTime(selectedMember.createdAt)}
                      </strong>
                    </div>

                    <div>
                      <span>Email xác minh lúc</span>
                      <strong>
                        {formatDateTime(
                          selectedMember.emailVerifiedAt
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>Cập nhật lần cuối</span>
                      <strong>
                        {formatDateTime(selectedMember.updatedAt)}
                      </strong>
                    </div>
                  </div>
                </section>

                {/* PURCHASE STATS */}
                <section className="member-detail-section">
                  <h3>Thống kê mua hàng</h3>

                  <div className="member-purchase-stats">
                    <div>
                      <span>Đơn thành công</span>
                      <strong>
                        {selectedMember.purchaseStats?.purchaseCount ?? 0}
                      </strong>
                    </div>

                    <div>
                      <span>Tổng sản phẩm</span>
                      <strong>
                        {
                          selectedMember.purchaseStats
                            ?.totalItemsPurchased ?? 0
                        }
                      </strong>
                    </div>

                    <div>
                      <span>Tổng chi tiêu</span>
                      <strong>
                        {formatCurrency(
                          selectedMember.purchaseStats?.totalSpend
                        )}
                      </strong>
                    </div>
                  </div>
                </section>

                {/* RECENT ORDERS */}
                <section className="member-detail-section">
                  <h3>10 đơn hàng gần nhất</h3>

                  {selectedMember.orders?.length > 0 ? (
                    <div className="member-detail-table-wrap">
                      <table className="catalog-table member-detail-table">
                        <thead>
                          <tr>
                            <th>Mã đơn hàng</th>
                            <th>Ngày đặt</th>
                            <th>Trạng thái</th>
                            <th>Thanh toán</th>
                            <th>Tổng tiền</th>
                          </tr>
                        </thead>

                        <tbody>
                          {selectedMember.orders.map((order) => (
                            <tr key={order.id}>
                              <td>{order.orderNumber}</td>

                              <td>{formatDateTime(order.createdAt)}</td>

                              <td>
                                {ORDER_STATUS_LABELS[order.status] ||
                                  order.status}
                              </td>

                              <td>
                                {PAYMENT_STATUS_LABELS[
                                  order.payment?.status
                                ] || "Chưa có"}
                              </td>

                              <td>{formatCurrency(order.totalAmount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="member-empty-state">
                      Thành viên chưa có đơn hàng.
                    </p>
                  )}
                </section>

                {/* STATUS HISTORY */}
                <section className="member-detail-section">
                  <h3>Lịch sử thay đổi trạng thái</h3>

                  {selectedMember.statusHistories?.length > 0 ? (
                    <div className="member-history-list">
                      {selectedMember.statusHistories.map((history) => (
                        <article
                          className="member-history-item"
                          key={history.id}
                        >
                          <div className="member-history-top">
                            <strong>
                              {STATUS_LABELS[history.oldStatus] ||
                                history.oldStatus}
                              {" → "}
                              {STATUS_LABELS[history.newStatus] ||
                                history.newStatus}
                            </strong>

                            <time>
                              {formatDateTime(history.createdAt)}
                            </time>
                          </div>

                          <p>{history.reason}</p>

                          <span>
                            Thực hiện bởi:{" "}
                            {history.admin?.fullName ||
                              history.admin?.email ||
                              "Không xác định"}
                          </span>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="member-empty-state">
                      Chưa có lịch sử thay đổi trạng thái.
                    </p>
                  )}
                </section>

                {/* DETAIL ACTIONS */}
                {["ACTIVE", "LOCKED"].includes(
                  selectedMember.status
                ) && (
                  <div className="catalog-modal-actions">
                    <button
                      type="button"
                      className="catalog-secondary-button"
                      onClick={closeMemberDetail}
                    >
                      Đóng
                    </button>

                    <button
                      type="button"
                      className={
                        selectedMember.status === "ACTIVE"
                          ? "member-danger-button"
                          : "catalog-primary-button"
                      }
                      onClick={() => openStatusModal(selectedMember)}
                    >
                      {selectedMember.status === "ACTIVE"
                        ? "Khóa tài khoản"
                        : "Mở khóa tài khoản"}
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </section>
        </div>
      )}

      {/* ================================== */}
      {/* STATUS CONFIRMATION MODAL */}
      {/* ================================== */}

      {statusModalOpen && statusTarget && (
        <div
          className="catalog-modal-backdrop member-status-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeStatusModal();
            }
          }}
        >
          <section
            className="catalog-modal member-status-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="member-status-title"
          >
            <div className="catalog-modal-heading">
              <div>
                <span className="admin-eyebrow">
                  ACCOUNT STATUS
                </span>

                <h2 id="member-status-title">
                  {statusTarget.status === "ACTIVE"
                    ? "Khóa tài khoản thành viên"
                    : "Mở khóa tài khoản thành viên"}
                </h2>
              </div>

              <button
                type="button"
                onClick={closeStatusModal}
                disabled={statusSaving}
                aria-label="Đóng"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleUpdateStatus}>
              <div className="member-status-warning">
                {statusTarget.status === "ACTIVE"
                  ? "Thành viên sẽ không thể tiếp tục sử dụng tài khoản khi tài khoản bị khóa."
                  : "Tài khoản sẽ được kích hoạt trở lại sau khi mở khóa."}
              </div>

              <div className="member-status-target">
                <strong>
                  {statusTarget.fullName || "Chưa cập nhật"}
                </strong>

                <span>{statusTarget.email}</span>
              </div>

              <label className="catalog-form-field">
                <span>Lý do thay đổi trạng thái</span>

                <textarea
                  value={statusReason}
                  onChange={(event) =>
                    setStatusReason(event.target.value)
                  }
                  maxLength={500}
                  rows={4}
                  required
                  placeholder="Nhập lý do..."
                  disabled={statusSaving}
                />

                <small>
                  {statusReason.length}/500 ký tự
                </small>
              </label>

              <div className="catalog-modal-actions">
                <button
                  type="button"
                  className="catalog-secondary-button"
                  onClick={closeStatusModal}
                  disabled={statusSaving}
                >
                  Hủy
                </button>

                <button
                  type="submit"
                  className={
                    statusTarget.status === "ACTIVE"
                      ? "member-danger-button"
                      : "catalog-primary-button"
                  }
                  disabled={statusSaving || !statusReason.trim()}
                >
                  {statusSaving
                    ? "Đang xử lý..."
                    : statusTarget.status === "ACTIVE"
                      ? "Xác nhận khóa"
                      : "Xác nhận mở khóa"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
