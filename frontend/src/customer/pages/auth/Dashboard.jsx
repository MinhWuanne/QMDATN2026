
import { useCallback, useEffect, useRef, useState } from "react";
import { Brand, Notice } from "../../components/auth/AuthComponents.jsx";
import {
  getMemberChatMessages,
  sendMemberChatMessage,
} from "../../services/chat.service.js";

function formatMessageTime(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getMessageList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.messages)) return payload.messages;
  return [];
}

export default function Dashboard({
  user,
  accessToken,
  onSessionRefresh,
  onSessionExpired,
  onLogout,
  logoutLoading,
  logoutError,
}) {
  const [messages, setMessages] = useState([]);
  const [content, setContent] = useState("");
  const [conversationStatus, setConversationStatus] = useState("OPEN");
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatNotice, setChatNotice] = useState("");

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const loadMessages = useCallback(async () => {
    setChatError("");
    setLoadingMessages(true);

    try {
      const result = await getMemberChatMessages({
        accessToken,
        onSessionRefresh,
        onSessionExpired,
        limit: 50,
      });

      setMessages(getMessageList(result));

      if (result?.conversation?.status) {
        setConversationStatus(result.conversation.status);
      } else if (result?.status) {
        setConversationStatus(result.status);
      }
    } catch (error) {
      setChatError(
        error.message || "Không thể tải lịch sử trò chuyện."
      );
    } finally {
      setLoadingMessages(false);
    }
  }, [accessToken, onSessionRefresh, onSessionExpired]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages]);

  async function handleSendMessage(event) {
    event.preventDefault();

    const trimmedContent = content.trim();

    if (!trimmedContent || sending) return;

    if (trimmedContent.length > 2000) {
      setChatError("Tin nhắn không được vượt quá 2.000 ký tự.");
      return;
    }

    setChatError("");
    setChatNotice("");
    setSending(true);

    try {
      await sendMemberChatMessage({
        content: trimmedContent,
        accessToken,
        onSessionRefresh,
        onSessionExpired,
      });

      setContent("");
      setConversationStatus("OPEN");
      setChatNotice("Tin nhắn đã được gửi thành công.");

      await loadMessages();
      textareaRef.current?.focus();
    } catch (error) {
      setChatError(
        error.message || "Gửi tin nhắn không thành công."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="auth-page customer-dashboard-page">
      <div className="customer-dashboard-shell">
        <Brand />

        <section className="customer-account-card">
          <div className="customer-account-heading">
            <div>
              <span className="auth-eyebrow">CUSTOMER ACCOUNT</span>
              <h1>Xin chào, {user?.fullName || "bạn"}!</h1>
              <p>Chào mừng bạn quay trở lại.</p>
            </div>

            <div className="customer-account-avatar">
              {(user?.fullName || "U").charAt(0).toUpperCase()}
            </div>
          </div>

          <div className="auth-user-info">
            <p><strong>Email:</strong> {user?.email}</p>
            <p><strong>Vai trò:</strong> {user?.role}</p>
          </div>

          <Notice>{logoutError}</Notice>

          <button
            className="auth-submit customer-logout-button"
            type="button"
            onClick={onLogout}
            disabled={logoutLoading}
          >
            {logoutLoading ? "ĐANG ĐĂNG XUẤT..." : "ĐĂNG XUẤT"}
            {!logoutLoading && <span aria-hidden="true"> ↗</span>}
          </button>
        </section>

        <section className="customer-chat-card">
          <header className="customer-chat-header">
            <div className="customer-chat-heading">
              <div className="customer-chat-icon">✉</div>
              <div>
                <span className="auth-eyebrow">CUSTOMER SUPPORT</span>
                <h2>Trung tâm hỗ trợ</h2>
                <p>Trao đổi trực tiếp với đội ngũ quản trị viên.</p>
              </div>
            </div>

            <div className="customer-chat-header-actions">
              <span
                className={`customer-chat-status ${
                  conversationStatus === "CLOSED" ? "closed" : ""
                }`}
              >
                <span />
                {conversationStatus === "CLOSED" ? "Đã đóng" : "Đang hỗ trợ"}
              </span>

              <button
                className="customer-chat-refresh"
                type="button"
                onClick={loadMessages}
                disabled={loadingMessages || sending}
                title="Tải lại tin nhắn"
                aria-label="Tải lại tin nhắn"
              >
                ↻
              </button>
            </div>
          </header>

          <div className="customer-chat-messages">
            {loadingMessages ? (
              <div className="customer-chat-state">
                <span className="customer-chat-spinner" />
                <p>Đang tải cuộc trò chuyện...</p>
              </div>
            ) : chatError && messages.length === 0 ? (
              <div className="customer-chat-state">
                <span className="customer-chat-state-icon">!</span>
                <p>{chatError}</p>
                <button type="button" onClick={loadMessages}>
                  Thử lại
                </button>
              </div>
            ) : messages.length === 0 ? (
              <div className="customer-chat-empty">
                <div className="customer-chat-empty-icon">✉</div>
                <h3>Bắt đầu cuộc trò chuyện</h3>
                <p>
                  Bạn chưa có tin nhắn nào. Hãy gửi câu hỏi,
                  chúng tôi sẽ hỗ trợ bạn sớm nhất có thể.
                </p>
              </div>
            ) : (
              <div className="customer-chat-message-list">
                {messages.map((message) => {
                  const isOwnMessage =
                    message.sender?.role === "CUSTOMER" ||
                    message.senderId === user?.id;

                  return (
                    <article
                      key={message.id}
                      className={`customer-chat-message ${
                        isOwnMessage ? "own" : "support"
                      }`}
                    >
                      {!isOwnMessage && (
                        <div className="customer-chat-message-avatar">
                          {(message.sender?.fullName || "A")
                            .charAt(0)
                            .toUpperCase()}
                        </div>
                      )}

                      <div className="customer-chat-message-body">
                        <div className="customer-chat-message-meta">
                          <strong>
                            {isOwnMessage
                              ? "Bạn"
                              : message.sender?.fullName || "Quản trị viên"}
                          </strong>
                          <time>{formatMessageTime(message.createdAt)}</time>
                        </div>

                        <div className="customer-chat-bubble">
                          {message.content}
                        </div>

                        {isOwnMessage && (
                          <span className="customer-chat-read-status">
                            {message.readAt ? "Đã xem ✓" : "Đã gửi"}
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {chatError && messages.length > 0 && (
            <div className="customer-chat-inline-error" role="alert">
              {chatError}
            </div>
          )}

          {chatNotice && (
            <div className="customer-chat-inline-success" role="status">
              {chatNotice}
            </div>
          )}

          <form
            className="customer-chat-compose"
            onSubmit={handleSendMessage}
          >
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
                if (chatError) setChatError("");
                if (chatNotice) setChatNotice("");
              }}
              placeholder="Nhập nội dung bạn cần hỗ trợ..."
              rows={3}
              maxLength={2000}
              disabled={sending}
            />

            <div className="customer-chat-compose-footer">
              <span>{content.length}/2000 ký tự</span>

              <button
                type="submit"
                disabled={!content.trim() || sending || loadingMessages}
              >
                {sending ? "ĐANG GỬI..." : "GỬI TIN NHẮN"}
                <span aria-hidden="true"> ↗</span>
              </button>
            </div>
          </form>

          <footer className="customer-chat-footer">
            Tin nhắn của bạn được lưu lại để thuận tiện cho việc hỗ trợ.
          </footer>
        </section>
      </div>
    </main>
  );
}
