
import { useCallback, useEffect, useRef, useState } from "react";
import { adminChatService } from "../../services/admin-chat.service.js";
import "./admin-chat.css";
import "./admin-chat-requests.css";

const PAGE_SIZE = 20;
const MESSAGE_LIMIT = 50;
const REFRESH_INTERVAL = 10000;

function formatTime(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatConversationTime(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  return sameDay
    ? formatTime(value)
    : new Intl.DateTimeFormat("vi-VN", {
        day: "2-digit",
        month: "2-digit",
      }).format(date);
}

function getInitials(name) {
  return String(name || "KH")
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function getErrorMessage(error) {
  return error?.message || "Đã xảy ra lỗi. Vui lòng thử lại.";
}

export default function AdminChatPage({
  accessToken,
  onSessionUpdate,
  onSessionExpired,
}) {
  const [conversations, setConversations] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });

  const [selectedId, setSelectedId] = useState(null);
  const [conversationData, setConversationData] = useState(null);
  const [messages, setMessages] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [messageInput, setMessageInput] = useState("");

  const [listLoading, setListLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState("");
  const [detailView, setDetailView] = useState("messages");
  const [requestType, setRequestType] = useState("EXCHANGE");
  const [prototypeNotice, setPrototypeNotice] = useState("");

  const messagesEndRef = useRef(null);
  const messageListRef = useRef(null);
  const selectedIdRef = useRef(selectedId);
  const mountedRef = useRef(false);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const handleError = useCallback((err) => {
    const message = getErrorMessage(err);
    setError(message);

    if (message.includes("Phiên đăng nhập đã hết hạn")) {
      onSessionExpired?.();
    }
  }, [onSessionExpired]);

  const loadConversations = useCallback(async ({
    silent = false,
    page = 1,
  } = {}) => {
    if (!silent) setListLoading(true);

    try {
      const result = await adminChatService.listConversations(
        {
          page,
          limit: PAGE_SIZE,
          ...(statusFilter !== "ALL" ? { status: statusFilter } : {}),
          ...(search ? { search } : {}),
        },
        accessToken,
        onSessionUpdate
      );

      setConversations(result.items || []);
      setPagination(result.pagination || {
        page,
        limit: PAGE_SIZE,
        total: 0,
        totalPages: 0,
      });

      return result.items || [];
    } catch (err) {
      handleError(err);
      return null;
    } finally {
      if (!silent) setListLoading(false);
    }
  }, [
    accessToken,
    handleError,
    onSessionUpdate,
    search,
    statusFilter,
  ]);

  const loadMessages = useCallback(async (
    conversationId,
    { silent = false } = {}
  ) => {
    if (!silent) setMessagesLoading(true);

    try {
      const result = await adminChatService.getMessages(
        conversationId,
        { limit: MESSAGE_LIMIT },
        accessToken,
        onSessionUpdate
      );

      if (selectedIdRef.current !== conversationId) return null;

      const data = result.data || {};

      setConversationData(data.conversation || null);
      setMessages(data.items || []);
      setNextCursor(data.nextCursor || null);

      return data;
    } catch (err) {
      handleError(err);
      return null;
    } finally {
      if (!silent) setMessagesLoading(false);
    }
  }, [accessToken, handleError, onSessionUpdate]);

  // Search debounce.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
    }, 350);

    return () => clearTimeout(timer);
  }, [searchInput]);

  // Load conversation list when filters change.
  useEffect(() => {
    loadConversations({ page: 1 });
  }, [loadConversations]);

  // Load selected conversation.
  useEffect(() => {
    if (!selectedId) {
      setConversationData(null);
      setMessages([]);
      setNextCursor(null);
      return;
    }

    setMessages([]);
    setConversationData(null);
    setNextCursor(null);

    loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  // Refresh conversation list and selected messages periodically.
  useEffect(() => {
    const timer = setInterval(() => {
      loadConversations({ silent: true, page: pagination.page });

      if (selectedIdRef.current) {
        loadMessages(selectedIdRef.current, { silent: true });
      }
    }, REFRESH_INTERVAL);

    return () => clearInterval(timer);
  }, [
    loadConversations,
    loadMessages,
    pagination.page,
  ]);

  // Scroll to latest message after initial load or sending.
  useEffect(() => {
    if (!messagesLoading && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    }
  }, [messages, messagesLoading]);

  // Prevent stale component updates on unmount.
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function handleSelectConversation(conversation) {
    setError("");
    setSelectedId(conversation.id);
    setDetailView("messages");
    setPrototypeNotice("");

    // Immediately clear unread badge in the selected row.
    setConversations((current) =>
      current.map((item) =>
        item.id === conversation.id
          ? { ...item, unreadCount: 0 }
          : item
      )
    );
  }

  async function handleSendMessage(event) {
    event.preventDefault();

    const content = messageInput.trim();

    if (!content || !selectedId || sending) return;

    if (conversationData?.status !== "OPEN") {
      setError("Hội thoại đã đóng. Khách hàng cần gửi tin nhắn mới để mở lại.");
      return;
    }

    setError("");
    setSending(true);

    try {
      await adminChatService.sendMessage(
        selectedId,
        content,
        accessToken,
        onSessionUpdate
      );

      setMessageInput("");

      await Promise.all([
        loadMessages(selectedId, { silent: true }),
        loadConversations({ silent: true, page: pagination.page }),
      ]);
    } catch (err) {
      handleError(err);
    } finally {
      setSending(false);
    }
  }

  async function handleCloseConversation() {
    if (!selectedId || closing) return;

    const confirmed = window.confirm(
      "Bạn có chắc chắn muốn đóng hội thoại này?"
    );

    if (!confirmed) return;

    setError("");
    setClosing(true);

    try {
      await adminChatService.closeConversation(
        selectedId,
        accessToken,
        onSessionUpdate
      );

      await Promise.all([
        loadMessages(selectedId, { silent: true }),
        loadConversations({ silent: true, page: pagination.page }),
      ]);
    } catch (err) {
      handleError(err);
    } finally {
      setClosing(false);
    }
  }

  async function handleLoadOlderMessages() {
    if (!selectedId || !nextCursor || olderLoading) return;

    setOlderLoading(true);

    const container = messageListRef.current;
    const previousHeight = container?.scrollHeight || 0;

    try {
      const result = await adminChatService.getMessages(
        selectedId,
        {
          limit: MESSAGE_LIMIT,
          cursor: nextCursor,
        },
        accessToken,
        onSessionUpdate
      );

      if (selectedIdRef.current !== selectedId) return;

      const data = result.data || {};

      setMessages((current) => [
        ...(data.items || []),
        ...current,
      ]);

      setNextCursor(data.nextCursor || null);

      requestAnimationFrame(() => {
        if (!container) return;

        const heightDifference =
          container.scrollHeight - previousHeight;

        container.scrollTop += heightDifference;
      });
    } catch (err) {
      handleError(err);
    } finally {
      setOlderLoading(false);
    }
  }

  const selectedConversation = conversations.find(
    (item) => item.id === selectedId
  );

  const isOpen = conversationData?.status === "OPEN";

  return (
    <section className="admin-chat-page">
      <div className="admin-chat-heading">
        <div>
          <span className="admin-chat-eyebrow">CUSTOMER SUPPORT</span>
          <h2>Hỗ trợ khách hàng</h2>
          <p>Quản lý và phản hồi các cuộc hội thoại từ khách hàng.</p>
        </div>

        <button
          type="button"
          className="admin-chat-refresh"
          onClick={() => loadConversations({ page: pagination.page })}
          disabled={listLoading}
        >
          ↻ Làm mới
        </button>
      </div>

      {error && (
        <div className="admin-chat-alert" role="alert">
          {error}
          <button type="button" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}

      <div className="admin-chat-workspace">
        <aside className="admin-chat-sidebar">
          <div className="admin-chat-list-heading">
            <div>
              <strong>Hội thoại</strong>
              <span>{pagination.total} cuộc trò chuyện</span>
            </div>
          </div>

          <div className="admin-chat-search">
            <span>⌕</span>
            <input
              type="search"
              placeholder="Tìm tên hoặc email..."
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>

          <div className="admin-chat-filters">
            {[
              { value: "ALL", label: "Tất cả" },
              { value: "OPEN", label: "Đang mở" },
              { value: "CLOSED", label: "Đã đóng" },
            ].map((filter) => (
              <button
                key={filter.value}
                type="button"
                className={statusFilter === filter.value ? "active" : ""}
                onClick={() => setStatusFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="admin-chat-conversation-list">
            {listLoading ? (
              <div className="admin-chat-empty">Đang tải hội thoại...</div>
            ) : conversations.length === 0 ? (
              <div className="admin-chat-empty">
                Không tìm thấy hội thoại.
              </div>
            ) : (
              conversations.map((conversation) => {
                const customer = conversation.customer;
                const lastMessage = conversation.lastMessage;

                return (
                  <button
                    key={conversation.id}
                    type="button"
                    className={`admin-chat-conversation ${
                      selectedId === conversation.id ? "selected" : ""
                    }`}
                    onClick={() => handleSelectConversation(conversation)}
                  >
                    <span className="admin-chat-avatar">
                      {getInitials(customer?.fullName)}
                    </span>

                    <span className="admin-chat-conversation-main">
                      <span className="admin-chat-conversation-top">
                        <strong>{customer?.fullName || "Khách hàng"}</strong>
                        <time>
                          {formatConversationTime(
                            lastMessage?.createdAt || conversation.lastMessageAt
                          )}
                        </time>
                      </span>

                      <span className="admin-chat-preview">
                        {lastMessage?.content || "Chưa có tin nhắn"}
                      </span>

                      <span className="admin-chat-conversation-bottom">
                        <span
                          className={`admin-chat-status ${
                            conversation.status === "OPEN" ? "open" : "closed"
                          }`}
                        >
                          {conversation.status === "OPEN" ? "Đang mở" : "Đã đóng"}
                        </span>

                        {conversation.unreadCount > 0 && (
                          <span className="admin-chat-unread">
                            {conversation.unreadCount}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className="admin-chat-pagination">
            <button
              type="button"
              disabled={pagination.page <= 1 || listLoading}
              onClick={() =>
                loadConversations({ page: pagination.page - 1 })
              }
            >
              ←
            </button>

            <span>
              {pagination.page} / {Math.max(1, pagination.totalPages)}
            </span>

            <button
              type="button"
              disabled={
                pagination.page >= pagination.totalPages || listLoading
              }
              onClick={() =>
                loadConversations({ page: pagination.page + 1 })
              }
            >
              →
            </button>
          </div>
        </aside>

        <main className="admin-chat-main">
          {!selectedId ? (
            <div className="admin-chat-placeholder">
              <span className="admin-chat-placeholder-icon">✉</span>
              <h3>Chọn một hội thoại</h3>
              <p>Chọn khách hàng ở danh sách bên trái để xem nội dung trao đổi.</p>
            </div>
          ) : (
            <>
              <header className="admin-chat-detail-header">
                <div className="admin-chat-detail-customer">
                  <span className="admin-chat-avatar large">
                    {getInitials(
                      conversationData?.customer?.fullName ||
                      selectedConversation?.customer?.fullName
                    )}
                  </span>

                  <div>
                    <strong>
                      {conversationData?.customer?.fullName ||
                        selectedConversation?.customer?.fullName ||
                        "Khách hàng"}
                    </strong>
                    <span>
                      {conversationData?.customer?.email ||
                        selectedConversation?.customer?.email ||
                        ""}
                    </span>
                  </div>
                </div>

                <div className="admin-chat-detail-actions">
                  <button
                    type="button"
                    className={`admin-chat-request-toggle ${detailView === "request" ? "active" : ""}`}
                    onClick={() => {
                      setDetailView((current) => current === "request" ? "messages" : "request");
                      setPrototypeNotice("");
                    }}
                  >
                    {detailView === "request" ? "← Tin nhắn" : "Xử lý yêu cầu"}
                  </button>
                  <span
                    className={`admin-chat-status ${
                      isOpen ? "open" : "closed"
                    }`}
                  >
                    {isOpen ? "Đang mở" : "Đã đóng"}
                  </span>

                  {isOpen && (
                    <button
                      type="button"
                      className="admin-chat-close-button"
                      onClick={handleCloseConversation}
                      disabled={closing}
                    >
                      {closing ? "Đang đóng..." : "Đóng hội thoại"}
                    </button>
                  )}
                </div>
              </header>

              {detailView === "request" ? (
                <section className="admin-chat-request-panel">
                  <div className="admin-chat-request-heading">
                    <div>
                      <span className="admin-chat-request-eyebrow">CUSTOMER SERVICE WORKSPACE</span>
                      <h3>Xử lý yêu cầu khách hàng</h3>
                      <p>Giao diện minh họa — chưa kết nối API hoặc thay đổi dữ liệu thật.</p>
                    </div>
                    <span className="admin-chat-request-status">Chờ phân loại</span>
                  </div>

                  <div className="admin-chat-request-type">
                    <label htmlFor="admin-chat-request-type">Loại yêu cầu</label>
                    <select
                      id="admin-chat-request-type"
                      value={requestType}
                      onChange={(event) => {
                        setRequestType(event.target.value);
                        setPrototypeNotice("");
                      }}
                    >
                      <option value="EXCHANGE">Đổi hàng</option>
                      <option value="RETURN">Trả hàng</option>
                      <option value="MEMBER_UPDATE">Cập nhật thông tin thành viên</option>
                    </select>
                  </div>

                  {requestType === "EXCHANGE" && (
                    <div className="admin-chat-request-form">
                      <div className="admin-chat-request-section-title">
                        <div><strong>Yêu cầu đổi hàng</strong><span>Thông tin đơn hàng và sản phẩm cần đổi</span></div>
                        <span className="admin-chat-request-tag exchange">ĐỔI HÀNG</span>
                      </div>
                      <div className="admin-chat-request-grid">
                        <label>Mã đơn hàng<input defaultValue="ORD-2026-00125" /></label>
                        <label>Ngày nhận hàng<input type="date" defaultValue="2026-11-12" /></label>
                        <label className="full">Sản phẩm trong đơn<select defaultValue="Áo thun thể thao - Size M"><option>Áo thun thể thao - Size M</option><option>Quần short thể thao - Size L</option></select></label>
                        <label>Số lượng đổi<input type="number" min="1" defaultValue="1" /></label>
                        <label>Sản phẩm / size muốn đổi<input defaultValue="Áo thun thể thao - Size L" /></label>
                        <label className="full">Lý do đổi hàng<textarea rows="3" defaultValue="Khách muốn đổi size do sản phẩm đang sử dụng bị chật." /></label>
                        <label className="full">Ghi chú kiểm tra hàng nhận<input placeholder="Tình trạng, phụ kiện, bao bì..." /></label>
                      </div>
                      <div className="admin-chat-request-check">
                        <input id="exchange-received" type="checkbox" />
                        <label htmlFor="exchange-received">Admin đã kiểm tra và xác nhận nhận được sản phẩm cũ</label>
                      </div>
                      <div className="admin-chat-request-summary"><strong>Luồng dự kiến</strong><span>Xác nhận hàng cũ → nhập lại kho → tạo đơn thay thế. Các bước chỉ được thực hiện sau khi tích hợp nghiệp vụ Backend.</span></div>
                    </div>
                  )}

                  {requestType === "RETURN" && (
                    <div className="admin-chat-request-form">
                      <div className="admin-chat-request-section-title">
                        <div><strong>Yêu cầu trả hàng</strong><span>Ghi nhận sản phẩm thực tế Admin nhận lại</span></div>
                        <span className="admin-chat-request-tag return">TRẢ HÀNG</span>
                      </div>
                      <div className="admin-chat-request-grid">
                        <label>Mã đơn hàng<input defaultValue="ORD-2026-00131" /></label>
                        <label>Ngày nhận hàng<input type="date" defaultValue="2026-11-10" /></label>
                        <label className="full">Sản phẩm khách yêu cầu trả<select defaultValue="Giày cầu lông - Size 42"><option>Giày cầu lông - Size 42</option><option>Áo thể thao - Size L</option></select></label>
                        <label>Số lượng theo đơn<input type="number" min="1" defaultValue="1" /></label>
                        <label>Số lượng thực nhận<input type="number" min="0" defaultValue="1" /></label>
                        <label className="full">Lý do trả hàng<textarea rows="3" defaultValue="Sản phẩm có lỗi đường may." /></label>
                        <label className="full">Tình trạng sản phẩm khi nhận<textarea rows="2" placeholder="Mô tả tình trạng thực tế..." /></label>
                      </div>
                      <div className="admin-chat-request-check">
                        <input id="return-received" type="checkbox" />
                        <label htmlFor="return-received">Admin xác nhận đã nhận và kiểm tra sản phẩm trả về</label>
                      </div>
                      <div className="admin-chat-request-summary"><strong>Lưu ý nghiệp vụ</strong><span>Ghi nhận hàng trả về; không tự động hoàn tiền. Việc hoàn tiền (nếu có) là quy trình riêng.</span></div>
                    </div>
                  )}

                  {requestType === "MEMBER_UPDATE" && (
                    <div className="admin-chat-request-form">
                      <div className="admin-chat-request-section-title">
                        <div><strong>Cập nhật thông tin thành viên</strong><span>Đối chiếu hồ sơ trước khi thay đổi</span></div>
                        <span className="admin-chat-request-tag member">THÀNH VIÊN</span>
                      </div>
                      <div className="admin-chat-request-grid">
                        <label>Mã thành viên<input defaultValue="MB-000128" /></label>
                        <label>Họ và tên hiện tại<input defaultValue="Nguyễn Minh Anh" /></label>
                        <label>Email hiện tại<input defaultValue="minhanh@example.com" /></label>
                        <label>Số điện thoại hiện tại<input defaultValue="0901234567" /></label>
                        <label>Họ và tên mới<input placeholder="Nhập họ tên mới" /></label>
                        <label>Số điện thoại mới<input placeholder="Nhập số điện thoại mới" /></label>
                        <label className="full">Địa chỉ mới<input placeholder="Nhập địa chỉ mới (nếu được phép cập nhật)" /></label>
                        <label className="full">Lý do thay đổi<textarea rows="3" placeholder="Ghi rõ yêu cầu và căn cứ xác minh từ khách hàng..." /></label>
                      </div>
                      <div className="admin-chat-request-summary"><strong>Kiểm soát thay đổi</strong><span>Chỉ cập nhật các trường được Backend cho phép; không chỉnh sửa vai trò, quyền hạn hoặc thông tin định danh hệ thống tại form này.</span></div>
                    </div>
                  )}

                  {prototypeNotice && <div className="admin-chat-request-notice" role="status">{prototypeNotice}</div>}
                  <div className="admin-chat-request-actions">
                    <button type="button" className="secondary" onClick={() => setPrototypeNotice("Đây là giao diện mẫu. Chưa có dữ liệu nào được lưu.")}>Lưu nháp (minh họa)</button>
                    <button type="button" className="primary" onClick={() => setPrototypeNotice("Thao tác đã được mô phỏng trên giao diện. Chưa gọi Backend và chưa thay đổi dữ liệu.")}>Mô phỏng xác nhận</button>
                  </div>
                </section>
              ) : (
              <div className="admin-chat-message-list" ref={messageListRef}>
                {nextCursor && (
                  <button
                    type="button"
                    className="admin-chat-load-older"
                    onClick={handleLoadOlderMessages}
                    disabled={olderLoading}
                  >
                    {olderLoading ? "Đang tải..." : "Tải tin nhắn cũ hơn"}
                  </button>
                )}

                {messagesLoading ? (
                  <div className="admin-chat-empty">Đang tải tin nhắn...</div>
                ) : messages.length === 0 ? (
                  <div className="admin-chat-empty">
                    Chưa có tin nhắn trong hội thoại này.
                  </div>
                ) : (
                  messages.map((message) => {
                    const isAdmin = message.sender?.role === "ADMIN";

                    return (
                      <div
                        key={message.id}
                        className={`admin-chat-message-row ${
                          isAdmin ? "outgoing" : "incoming"
                        }`}
                      >
                        <div className="admin-chat-message-bubble">
                          <p>{message.content}</p>
                          <time>{formatTime(message.createdAt)}</time>
                        </div>
                      </div>
                    );
                  })
                )}

                <div ref={messagesEndRef} />
              </div>
              )}

              {detailView === "messages" && (
              <form
                className="admin-chat-composer"
                onSubmit={handleSendMessage}
              >
                {!isOpen ? (
                  <div className="admin-chat-closed-notice">
                    Hội thoại đã đóng. Khách hàng cần gửi tin nhắn mới để mở lại.
                  </div>
                ) : (
                  <>
                    <textarea
                      value={messageInput}
                      onChange={(event) => setMessageInput(event.target.value)}
                      placeholder="Nhập tin nhắn phản hồi..."
                      maxLength={2000}
                      rows={2}
                      disabled={sending}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" &&
                          !event.shiftKey &&
                          !event.nativeEvent.isComposing
                        ) {
                          event.preventDefault();
                          event.currentTarget.form?.requestSubmit();
                        }
                      }}
                    />

                    <div className="admin-chat-composer-footer">
                      <span>{messageInput.length}/2000 · Enter để gửi, Shift + Enter xuống dòng</span>

                      <button
                        type="submit"
                        disabled={!messageInput.trim() || sending}
                      >
                        {sending ? "Đang gửi..." : "Gửi tin nhắn →"}
                      </button>
                    </div>
                  </>
                )}
              </form>
              )}
            </>
          )}
        </main>
      </div>
    </section>
  );
}
