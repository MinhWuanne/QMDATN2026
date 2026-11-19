
import { useCallback, useEffect, useRef, useState } from "react";
import { adminChatService } from "../../services/admin-chat.service.js";
import { adminReturnService } from "../../services/admin-return.service.js";
import { adminMemberProfileRequestService } from "../../services/admin-member-profile-request.service.js";
import "./admin-chat.css";
import "./admin-chat-requests.css";

const PAGE_SIZE = 20;
const MESSAGE_LIMIT = 50;
const REFRESH_INTERVAL = 10000;
const RETURN_PAGE_SIZE = 20;

const RETURN_STATUS_LABELS = {
  REQUESTED: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Đã từ chối",
  RECEIVED: "Đã nhận hàng",
  INSPECTING: "Đang kiểm tra",
  REFUND_PENDING: "Chờ hoàn tiền",
  WAITING_FOR_STOCK: "Chờ tồn kho",
  REPLACEMENT_PENDING: "Chờ giao hàng thay thế",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
};

const RETURN_ITEM_STATUS_LABELS = {
  PENDING: "Chờ xử lý",
  REJECTED: "Đã từ chối",
  REFUND_PENDING: "Chờ hoàn tiền",
  WAITING_FOR_STOCK: "Chờ tồn kho",
  REPLACEMENT_PENDING: "Chờ giao hàng thay thế",
  COMPLETED: "Hoàn tất",
};

const RETURN_TYPE_LABELS = {
  RETURN: "Trả hàng",
  EXCHANGE: "Đổi hàng",
};

const RETURN_RESOLUTION_LABELS = {
  REFUND: "Hoàn tiền",
  EXCHANGE: "Đổi hàng",
};

const PROFILE_REQUEST_STATUS_LABELS = {
  REQUESTED: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Đã từ chối",
};

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

function formatCurrency(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const number = Number(value);
  if (!Number.isFinite(number)) return "—";

  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(number);
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

function getStatusClass(status) {
  switch (status) {
    case "COMPLETED":
      return "completed";
    case "REJECTED":
    case "CANCELLED":
      return "rejected";
    case "REQUESTED":
      return "pending";
    case "REFUND_PENDING":
    case "WAITING_FOR_STOCK":
    case "REPLACEMENT_PENDING":
      return "processing";
    default:
      return "active";
  }
}

function getReturnItems(request) {
  return Array.isArray(request?.items) ? request.items : [];
}

function getOrderItem(item) {
  return item?.orderItem || {};
}

function getExchangeVariant(item) {
  return item?.exchangeVariant || null;
}

function getReturnRequestId(request) {
  return request?.id || "";
}

function getReturnActionDescription(request) {
  switch (request?.status) {
    case "REQUESTED":
      return "Kiểm tra thông tin và duyệt hoặc từ chối yêu cầu.";
    case "APPROVED":
      return "Xác nhận đã nhận được hàng khách gửi về.";
    case "INSPECTING":
      return "Kiểm tra sản phẩm thực tế trước khi chấp nhận hoặc từ chối.";
    case "REFUND_PENDING":
      return "Thực hiện hoàn tiền bên ngoài hệ thống, sau đó xác nhận mã giao dịch.";
    case "WAITING_FOR_STOCK":
      return "Kiểm tra tồn kho phiên bản thay thế và thử tạo đơn đổi hàng.";
    case "REPLACEMENT_PENDING":
      return "Đơn thay thế đang chờ giao đến khách hàng.";
    case "COMPLETED":
      return "Yêu cầu đã hoàn tất.";
    case "REJECTED":
      return "Yêu cầu đã bị từ chối.";
    case "CANCELLED":
      return "Yêu cầu đã bị hủy.";
    default:
      return "Theo dõi trạng thái xử lý yêu cầu.";
  }
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

  // Return / Exchange workspace.
  const [returnRequests, setReturnRequests] = useState([]);
  const [returnPagination, setReturnPagination] = useState({
    page: 1,
    limit: RETURN_PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });
  const [selectedReturnId, setSelectedReturnId] = useState(null);
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [returnListLoading, setReturnListLoading] = useState(false);
  const [returnDetailLoading, setReturnDetailLoading] = useState(false);
  const [returnActionLoading, setReturnActionLoading] = useState(false);
  const [returnError, setReturnError] = useState("");
  const [returnNotice, setReturnNotice] = useState("");
  const [returnPage, setReturnPage] = useState(1);

  const messagesEndRef = useRef(null);
  const messageListRef = useRef(null);
  const selectedIdRef = useRef(selectedId);
  const returnCustomerIdRef = useRef(null);

  const returnListRequestRef = useRef(0);
  const returnDetailRequestRef = useRef(0);

  const profileListRequestRef = useRef(0);
  const profileDetailRequestRef = useRef(0);

  // Member profile request workspace.
  const [profileRequests, setProfileRequests] = useState([]);
  const [profilePagination, setProfilePagination] = useState({
    page: 1,
    limit: RETURN_PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });

  const [selectedProfileRequestId, setSelectedProfileRequestId] =
    useState(null);
  const [selectedProfileRequest, setSelectedProfileRequest] = useState(null);

  const [profileListLoading, setProfileListLoading] = useState(false);
  const [profileDetailLoading, setProfileDetailLoading] = useState(false);
  const [profileActionLoading, setProfileActionLoading] = useState(false);

  const [profileError, setProfileError] = useState("");
  const [profileNotice, setProfileNotice] = useState("");
  const [profilePage, setProfilePage] = useState(1);

  const [requestType, setRequestType] = useState("RETURN");

  const selectedConversation = conversations.find(
    (item) => item.id === selectedId
  );

  const activeCustomerId =
    conversationData?.customer?.id ||
    selectedConversation?.customer?.id ||
    null;

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

  const handleReturnError = useCallback((err) => {
    const message = getErrorMessage(err);
    setReturnError(message);

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

  const loadReturnRequests = useCallback(async ({
    silent = false,
    page = 1,
    customerId,
  } = {}) => {
    const requestId = ++returnListRequestRef.current;

    if (!customerId) {
      returnCustomerIdRef.current = null;
      setReturnRequests([]);
      setReturnPagination({
        page: 1,
        limit: RETURN_PAGE_SIZE,
        total: 0,
        totalPages: 0,
      });
      setSelectedReturnId(null);
      setSelectedReturn(null);
      setReturnListLoading(false);
      return null;
    }

    if (!silent) setReturnListLoading(true);

    setReturnError("");

    try {
      const result = await adminReturnService.list(
        {
          customerId,
          page,
          limit: RETURN_PAGE_SIZE,
        },
        accessToken,
        onSessionUpdate
      );

      // Bỏ qua kết quả của request cũ.
      if (
        requestId !== returnListRequestRef.current ||
        returnCustomerIdRef.current !== customerId
      ) {
        return null;
      }

      const items = result.items || result.requests || [];

      setReturnRequests(items);
      setReturnPagination(result.pagination || {
        page,
        limit: RETURN_PAGE_SIZE,
        total: items.length,
        totalPages: items.length ? 1 : 0,
      });

      return items;
    } catch (err) {
      if (
        requestId === returnListRequestRef.current &&
        returnCustomerIdRef.current === customerId
      ) {
        handleReturnError(err);
      }

      return null;
    } finally {
      if (requestId === returnListRequestRef.current) {
        setReturnListLoading(false);
      }
    }
  }, [accessToken, handleReturnError, onSessionUpdate]);

  const loadReturnDetail = useCallback(async (
    returnId,
    { silent = false } = {}
  ) => {
    const requestId = ++returnDetailRequestRef.current;

    if (!returnId) {
      setSelectedReturn(null);
      setReturnDetailLoading(false);
      return null;
    }

    if (!silent) setReturnDetailLoading(true);

    setReturnError("");

    try {
      const result = await adminReturnService.getById(
        returnId,
        accessToken,
        onSessionUpdate
      );

      // Không nhận kết quả nếu Admin đã chuyển sang yêu cầu khác.
      if (requestId !== returnDetailRequestRef.current) {
        return null;
      }

      const data =
        result.returnRequest ||
        result.request ||
        result;

      setSelectedReturn(data);

      return data;
    } catch (err) {
      if (requestId === returnDetailRequestRef.current) {
        handleReturnError(err);
      }

      return null;
    } finally {
      if (requestId === returnDetailRequestRef.current) {
        setReturnDetailLoading(false);
      }
    }
  }, [accessToken, handleReturnError, onSessionUpdate]);

  const loadProfileRequests = useCallback(async ({
    silent = false,
    page = 1,
    customerId,
  } = {}) => {
    const requestId = ++profileListRequestRef.current;

    if (!customerId) {
      setProfileRequests([]);
      setProfilePagination({
        page: 1,
        limit: RETURN_PAGE_SIZE,
        total: 0,
        totalPages: 0,
      });
      setSelectedProfileRequestId(null);
      setSelectedProfileRequest(null);
      setProfileListLoading(false);
      return null;
    }

    if (!silent) setProfileListLoading(true);

    setProfileError("");

    try {
      const result = await adminMemberProfileRequestService.list(
        {
          page,
          limit: RETURN_PAGE_SIZE,
          customerId,
        },
        accessToken,
        onSessionUpdate
      );

      if (requestId !== profileListRequestRef.current) {
        return null;
      }

      // API hồ sơ hiện tại không có bộ lọc customerId.
      // Chỉ hiển thị yêu cầu thuộc khách hàng đang được chọn trong Chat.
      const items = result.items || [];

      setProfileRequests(items);
      setProfilePagination(result.pagination || {
        page,
        limit: RETURN_PAGE_SIZE,
        total: items.length,
        totalPages: items.length ? 1 : 0,
      });

      return items;
    } catch (err) {
      if (requestId === profileListRequestRef.current) {
        const message = getErrorMessage(err);
        setProfileError(message);

        if (message.includes("Phiên đăng nhập đã hết hạn")) {
          onSessionExpired?.();
        }
      }

      return null;
    } finally {
      if (requestId === profileListRequestRef.current) {
        setProfileListLoading(false);
      }
    }
  }, [accessToken, onSessionUpdate, onSessionExpired]);

  const loadProfileRequestDetail = useCallback(async (
    requestId,
    { silent = false } = {}
  ) => {
    const currentRequestId = ++profileDetailRequestRef.current;

    if (!requestId) {
      setSelectedProfileRequest(null);
      setProfileDetailLoading(false);
      return null;
    }

    if (!silent) setProfileDetailLoading(true);

    setProfileError("");

    try {
      const result = await adminMemberProfileRequestService.getById(
        requestId,
        accessToken,
        onSessionUpdate
      );

      if (currentRequestId !== profileDetailRequestRef.current) {
        return null;
      }

      const data =
        result.profileRequest ||
        result.request ||
        result;

      setSelectedProfileRequest(data);
      return data;
    } catch (err) {
      if (currentRequestId === profileDetailRequestRef.current) {
        const message = getErrorMessage(err);
        setProfileError(message);

        if (message.includes("Phiên đăng nhập đã hết hạn")) {
          onSessionExpired?.();
        }
      }

      return null;
    } finally {
      if (currentRequestId === profileDetailRequestRef.current) {
        setProfileDetailLoading(false);
      }
    }
  }, [accessToken, onSessionUpdate, onSessionExpired]);

  const refreshReturnWorkspace = useCallback(async () => {
    const customerId =
      conversationData?.customer?.id ||
      selectedConversationCustomerId(conversations, selectedId);

    if (!customerId) return;

    const items = await loadReturnRequests({
      page: returnPage,
      customerId,
    });

    if (selectedReturnId && items?.some((item) => item.id === selectedReturnId)) {
      await loadReturnDetail(selectedReturnId);
    } else if (selectedReturnId && items?.length) {
      setSelectedReturnId(items[0].id);
      await loadReturnDetail(items[0].id);
    } else if (!items?.length) {
      setSelectedReturnId(null);
      setSelectedReturn(null);
    }
  }, [
    conversationData,
    conversations,
    loadReturnDetail,
    loadReturnRequests,
    returnPage,
    selectedId,
    selectedReturnId,
  ]);

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

  // Load return requests when workspace opens or selected customer changes.
  useEffect(() => {
    if (detailView !== "request") return;

    if (!activeCustomerId) {
      returnCustomerIdRef.current = null;
      setReturnRequests([]);
      setSelectedReturnId(null);
      setSelectedReturn(null);
      setReturnError("");
      setReturnListLoading(false);
      return;
    }

    returnCustomerIdRef.current = activeCustomerId;

    setReturnPage(1);
    setSelectedReturnId(null);
    setSelectedReturn(null);
    setReturnError("");
    setReturnNotice("");

    // Vô hiệu hóa request chi tiết cũ.
    returnDetailRequestRef.current += 1;
    setReturnDetailLoading(false);

    loadReturnRequests({
      page: 1,
      customerId: activeCustomerId,
    });
  }, [
    detailView,
    selectedId,
    activeCustomerId,
    loadReturnRequests,
  ]);

  // Load detail after selecting a return request.
  useEffect(() => {
    if (detailView !== "request" || !selectedReturnId) return;

    loadReturnDetail(selectedReturnId);
  }, [detailView, selectedReturnId, loadReturnDetail]);

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
    if (!messagesLoading && messages.length > 0 && detailView === "messages") {
      messagesEndRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    }
  }, [messages, messagesLoading, detailView]);

  useEffect(() => {
    if (detailView !== "request" || requestType !== "PROFILE") return;

    const customerId =
      conversationData?.customer?.id ||
      selectedConversationCustomerId(conversations, selectedId);

    setProfilePage(1);
    setSelectedProfileRequestId(null);
    setSelectedProfileRequest(null);

    profileListRequestRef.current += 1;
    profileDetailRequestRef.current += 1;

    loadProfileRequests({
      page: 1,
      customerId,
    });
  }, [
    detailView,
    requestType,
    selectedId,
    conversationData?.customer?.id,
  ]);

  async function handleSelectConversation(conversation) {
    setError("");
    setSelectedId(conversation.id);
    setDetailView("messages");
    setReturnRequests([]);
    setSelectedReturnId(null);
    setSelectedReturn(null);
    setReturnError("");
    setReturnNotice("");

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

  async function handleReturnAction(action) {
    if (!selectedReturn || returnActionLoading) return;

    const requestId = selectedReturn.id;
    let payload = {};

    if (action === "reject") {
      const adminNote = window.prompt(
        "Nhập lý do từ chối yêu cầu:"
      );

      if (adminNote === null) return;

      if (!adminNote.trim()) {
        setReturnError("Vui lòng nhập lý do từ chối.");
        return;
      }

      payload = { adminNote: adminNote.trim() };
    }

    if (action === "approve") {
      const adminNote = window.prompt(
        "Ghi chú duyệt yêu cầu (có thể để trống):"
      );

      if (adminNote === null) return;

      payload = { adminNote: adminNote.trim() };
    }

    if (action === "accept") {
      const conditionNote = window.prompt(
        "Ghi nhận tình trạng sản phẩm sau khi kiểm tra:"
      );

      if (conditionNote === null) return;

      if (!conditionNote.trim()) {
        setReturnError("Vui lòng ghi nhận tình trạng sản phẩm.");
        return;
      }

      payload = { conditionNote: conditionNote.trim() };
    }

    if (action === "retryExchange") {
      const adminNote = window.prompt(
        "Ghi chú xử lý đổi hàng (có thể để trống):"
      );

      if (adminNote === null) return;

      payload = { adminNote: adminNote.trim() };
    }

    if (action === "confirmRefund") {
      const refundReference = window.prompt(
        "Nhập mã tham chiếu giao dịch hoàn tiền đã thực hiện:"
      );

      if (refundReference === null) return;

      if (!refundReference.trim()) {
        setReturnError("Vui lòng nhập mã tham chiếu hoàn tiền.");
        return;
      }

      payload = { refundReference: refundReference.trim() };
    }

    const confirmations = {
      approve: "Bạn chắc chắn muốn duyệt yêu cầu này?",
      reject: "Bạn chắc chắn muốn từ chối yêu cầu này?",
      receive:
        "Xác nhận đã nhận được hàng khách gửi về? Thao tác này chỉ chuyển sang kiểm tra, chưa cập nhật tồn kho.",
      accept:
        "Chấp nhận sản phẩm sau kiểm tra? Hệ thống sẽ cập nhật tồn kho và chuyển sang bước tiếp theo.",
      retryExchange:
        "Thử tạo đơn hàng thay thế với tồn kho hiện tại?",
      confirmRefund:
        "Xác nhận đã hoàn tiền thủ công cho khách hàng?",
    };

    if (!window.confirm(confirmations[action] || "Xác nhận thao tác?")) {
      return;
    }

    setReturnActionLoading(true);
    setReturnError("");
    setReturnNotice("");

    try {
      switch (action) {
        case "approve":
          await adminReturnService.approve(
            requestId,
            payload,
            accessToken,
            onSessionUpdate
          );
          break;

        case "reject":
          await adminReturnService.reject(
            requestId,
            payload,
            accessToken,
            onSessionUpdate
          );
          break;

        case "receive":
          await adminReturnService.receive(
            requestId,
            {},
            accessToken,
            onSessionUpdate
          );
          break;

        case "accept":
          await adminReturnService.accept(
            requestId,
            payload,
            accessToken,
            onSessionUpdate
          );
          break;

        case "retryExchange":
          await adminReturnService.retryExchange(
            requestId,
            payload,
            accessToken,
            onSessionUpdate
          );
          break;

        case "confirmRefund":
          await adminReturnService.confirmRefund(
            requestId,
            payload,
            accessToken,
            onSessionUpdate
          );
          break;

        default:
          return;
      }

      setReturnNotice("Đã thực hiện thao tác thành công.");

      const customerId =
        conversationData?.customer?.id ||
        selectedConversationCustomerId(conversations, selectedId);

      const items = await loadReturnRequests({
        page: returnPage,
        customerId,
      });

      if (items?.some((item) => item.id === requestId)) {
        await loadReturnDetail(requestId);
      } else {
        setSelectedReturnId(null);
        setSelectedReturn(null);
      }
    } catch (err) {
      handleReturnError(err);
    } finally {
      setReturnActionLoading(false);
    }
  }

  async function handleProfileRequestAction(action) {
    if (!selectedProfileRequest || profileActionLoading) return;

    const requestId = selectedProfileRequest.id;
    let payload = {};

    if (action === "approve") {
      const adminNote = window.prompt(
        "Ghi chú duyệt yêu cầu (có thể để trống):"
      );

      if (adminNote === null) return;

      payload = { adminNote: adminNote.trim() };
    }

    if (action === "reject") {
      const rejectionReason = window.prompt(
        "Nhập lý do từ chối yêu cầu (ít nhất 3 ký tự):"
      );

      if (rejectionReason === null) return;

      if (rejectionReason.trim().length < 3) {
        setProfileError("Lý do từ chối phải có ít nhất 3 ký tự.");
        return;
      }

      if (rejectionReason.trim().length > 1000) {
        setProfileError("Lý do từ chối không được vượt quá 1000 ký tự.");
        return;
      }

      payload = {
        rejectionReason: rejectionReason.trim(),
      };
    }

    const confirmation = action === "approve"
      ? "Duyệt yêu cầu cập nhật hồ sơ? Thông tin tài khoản khách hàng sẽ được cập nhật."
      : "Từ chối yêu cầu cập nhật hồ sơ?";

    if (!window.confirm(confirmation)) return;

    setProfileActionLoading(true);
    setProfileError("");
    setProfileNotice("");

    try {
      if (action === "approve") {
        await adminMemberProfileRequestService.approve(
          requestId,
          payload,
          accessToken,
          onSessionUpdate
        );
      } else if (action === "reject") {
        await adminMemberProfileRequestService.reject(
          requestId,
          payload,
          accessToken,
          onSessionUpdate
        );
      } else {
        return;
      }

      setProfileNotice(
        action === "approve"
          ? "Đã duyệt yêu cầu và cập nhật hồ sơ khách hàng."
          : "Đã từ chối yêu cầu cập nhật hồ sơ."
      );

      const customerId =
        conversationData?.customer?.id ||
        selectedConversationCustomerId(conversations, selectedId);

      const items = await loadProfileRequests({
        page: profilePage,
        customerId,
      });

      if (items?.some((item) => item.id === requestId)) {
        await loadProfileRequestDetail(requestId);
      } else {
        setSelectedProfileRequestId(null);
        setSelectedProfileRequest(null);
      }
    } catch (err) {
      const message = getErrorMessage(err);
      setProfileError(message);

      if (message.includes("Phiên đăng nhập đã hết hạn")) {
        onSessionExpired?.();
      }
    } finally {
      setProfileActionLoading(false);
    }
  }

  function handleSelectProfileRequest(request) {
    setSelectedProfileRequestId(request.id);
    setSelectedProfileRequest(null);
    setProfileError("");
    setProfileNotice("");

    loadProfileRequestDetail(request.id);
  }

  function handleSelectReturn(request) {
    returnDetailRequestRef.current += 1;

    setSelectedReturnId(request.id);
    setSelectedReturn(null);
    setReturnDetailLoading(false);
    setReturnError("");
    setReturnNotice("");
  }

  async function handleReturnPageChange(page) {
    if (
      page < 1 ||
      page > Math.max(1, returnPagination.totalPages) ||
      returnListLoading
    ) {
      return;
    }

    setReturnPage(page);

    // Hủy hiệu lực request chi tiết đang chạy.
    returnDetailRequestRef.current += 1;

    setSelectedReturnId(null);
    setSelectedReturn(null);
    setReturnDetailLoading(false);

    await loadReturnRequests({
      page,
      customerId: activeCustomerId,
    });
  }

  const isOpen = conversationData?.status === "OPEN";

  const customer =
    conversationData?.customer ||
    selectedConversation?.customer ||
    null;

  const returnItems = getReturnItems(selectedReturn);
  const order = selectedReturn?.order || null;

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
                const conversationCustomer = conversation.customer;
                const lastMessage = conversation.lastMessage;

                return (
                  <button
                    key={conversation.id}
                    type="button"
                    className={`admin-chat-conversation ${selectedId === conversation.id ? "selected" : ""
                      }`}
                    onClick={() => handleSelectConversation(conversation)}
                  >
                    <span className="admin-chat-avatar">
                      {getInitials(conversationCustomer?.fullName)}
                    </span>

                    <span className="admin-chat-conversation-main">
                      <span className="admin-chat-conversation-top">
                        <strong>
                          {conversationCustomer?.fullName || "Khách hàng"}
                        </strong>
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
                          className={`admin-chat-status ${conversation.status === "OPEN" ? "open" : "closed"
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
              <p>
                Chọn khách hàng ở danh sách bên trái để xem nội dung trao đổi.
              </p>
            </div>
          ) : (
            <>
              <header className="admin-chat-detail-header">
                <div className="admin-chat-detail-customer">
                  <span className="admin-chat-avatar large">
                    {getInitials(customer?.fullName)}
                  </span>

                  <div>
                    <strong>{customer?.fullName || "Khách hàng"}</strong>
                    <span>{customer?.email || ""}</span>
                  </div>
                </div>

                <div className="admin-chat-detail-actions">
                  <button
                    type="button"
                    className={`admin-chat-request-toggle ${detailView === "request" ? "active" : ""
                      }`}
                    onClick={() => {
                      setDetailView((current) =>
                        current === "request" ? "messages" : "request"
                      );
                      setReturnError("");
                      setReturnNotice("");
                    }}
                  >
                    {detailView === "request"
                      ? "← Tin nhắn"
                      : requestType === "RETURN"
                        ? "Đổi / trả hàng"
                        : "Cập nhật hồ sơ"}
                  </button>

                  <span
                    className={`admin-chat-status ${isOpen ? "open" : "closed"}`}
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
                      <span className="admin-chat-request-eyebrow">
                        CUSTOMER SERVICE WORKSPACE
                      </span>

                      <h3>
                        {requestType === "RETURN"
                          ? "Quản lý yêu cầu đổi / trả hàng"
                          : "Quản lý yêu cầu cập nhật hồ sơ"}
                      </h3>

                      <p>
                        Các yêu cầu của khách hàng đang được chọn trong hội thoại.
                      </p>

                      <div className="admin-chat-request-tabs">
                        <button
                          type="button"
                          className={requestType === "RETURN" ? "active" : ""}
                          onClick={() => setRequestType("RETURN")}
                        >
                          Đổi / trả hàng
                          <span>{returnPagination.total}</span>
                        </button>

                        <button
                          type="button"
                          className={requestType === "PROFILE" ? "active" : ""}
                          onClick={() => setRequestType("PROFILE")}
                        >
                          Cập nhật hồ sơ
                          <span>{profilePagination.total}</span>
                        </button>
                      </div>
                    </div>

                    <span className="admin-chat-request-status">
                      {requestType === "RETURN"
                        ? `${returnPagination.total} yêu cầu`
                        : `${profilePagination.total} yêu cầu`}
                    </span>
                  </div>

                  {returnError && (
                    <div className="admin-chat-request-notice error" role="alert">
                      {returnError}
                    </div>
                  )}

                  {returnNotice && (
                    <div className="admin-chat-request-notice" role="status">
                      {returnNotice}
                    </div>
                  )}

                  {requestType === "RETURN" ? (
                    <div className="admin-chat-return-layout">
                      <aside className="admin-chat-return-list">
                        <div className="admin-chat-return-list-heading">
                          <strong>Danh sách yêu cầu</strong>
                          <button
                            type="button"
                            onClick={refreshReturnWorkspace}
                            disabled={returnListLoading}
                          >
                            ↻
                          </button>
                        </div>

                        <div className="admin-chat-list-content">
                          {returnListLoading ? (
                            <div className="admin-chat-empty">
                              Đang tải yêu cầu...
                            </div>
                          ) : returnRequests.length === 0 ? (
                            <div className="admin-chat-empty">
                              Khách hàng chưa có yêu cầu đổi / trả hàng.
                            </div>
                          ) : (
                            <div className="admin-chat-return-items">
                              {returnRequests.map((request) => (
                                <button
                                  type="button"
                                  key={request.id}
                                  className={`admin-chat-return-item ${selectedReturnId === request.id ? "selected" : ""
                                    }`}
                                  onClick={() => handleSelectReturn(request)}
                                >
                                  <span className="admin-chat-return-item-top">
                                    <strong>
                                      {request.order?.orderNumber || "Đơn hàng"}
                                    </strong>

                                    <span
                                      className={`admin-chat-return-badge ${getStatusClass(
                                        request.status
                                      )}`}
                                    >
                                      {RETURN_STATUS_LABELS[request.status] ||
                                        request.status}
                                    </span>
                                  </span>

                                  <span className="admin-chat-return-item-meta">
                                    {RETURN_TYPE_LABELS[request.type] || request.type}
                                    {" · "}
                                    {RETURN_RESOLUTION_LABELS[request.resolution] ||
                                      request.resolution}
                                  </span>

                                  <span className="admin-chat-return-item-date">
                                    Tạo ngày {formatDate(request.createdAt)}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {returnPagination.totalPages > 1 && (
                          <div className="admin-chat-pagination">
                            <button
                              type="button"
                              disabled={returnPage <= 1 || returnListLoading}
                              onClick={() => handleReturnPageChange(returnPage - 1)}
                            >
                              ←
                            </button>

                            <span>
                              {returnPage} / {returnPagination.totalPages}
                            </span>

                            <button
                              type="button"
                              disabled={
                                returnPage >= returnPagination.totalPages ||
                                returnListLoading
                              }
                              onClick={() => handleReturnPageChange(returnPage + 1)}
                            >
                              →
                            </button>
                          </div>
                        )}
                      </aside>

                      <div className="admin-chat-return-detail">
                        {!selectedReturnId ? (
                          <div className="admin-chat-empty">
                            Chọn một yêu cầu để xem chi tiết.
                          </div>
                        ) : returnDetailLoading ? (
                          <div className="admin-chat-empty">
                            Đang tải chi tiết yêu cầu...
                          </div>
                        ) : !selectedReturn ? (
                          <div className="admin-chat-empty">
                            Không tải được chi tiết yêu cầu.
                          </div>
                        ) : (
                          <>
                            <div className="admin-chat-return-detail-heading">
                              <div>
                                <span className="admin-chat-request-eyebrow">
                                  CHI TIẾT YÊU CẦU
                                </span>
                                <h4>{order?.orderNumber || "Đơn hàng"}</h4>
                                <span>
                                  Tạo ngày {formatDate(selectedReturn.createdAt)}
                                </span>
                              </div>

                              <span
                                className={`admin-chat-return-badge ${getStatusClass(
                                  selectedReturn.status
                                )}`}
                              >
                                {RETURN_STATUS_LABELS[selectedReturn.status] ||
                                  selectedReturn.status}
                              </span>
                            </div>

                            <div className="admin-chat-return-summary">
                              <div>
                                <span>Loại yêu cầu</span>
                                <strong>
                                  {RETURN_TYPE_LABELS[selectedReturn.type] ||
                                    selectedReturn.type}
                                </strong>
                              </div>

                              <div>
                                <span>Hướng xử lý</span>
                                <strong>
                                  {RETURN_RESOLUTION_LABELS[
                                    selectedReturn.resolution
                                  ] || selectedReturn.resolution}
                                </strong>
                              </div>

                              <div>
                                <span>Ngày giao hàng</span>
                                <strong>{formatDate(order?.deliveredAt)}</strong>
                              </div>

                              <div>
                                <span>Thanh toán</span>
                                <strong>{order?.payment?.status || "—"}</strong>
                              </div>
                            </div>

                            <div className="admin-chat-return-section">
                              <h5>Thông tin khách hàng</h5>

                              <div className="admin-chat-return-readonly-grid">
                                <div>
                                  <span>Họ tên</span>
                                  <strong>
                                    {selectedReturn.user?.fullName || "—"}
                                  </strong>
                                </div>

                                <div>
                                  <span>Email</span>
                                  <strong>{selectedReturn.user?.email || "—"}</strong>
                                </div>

                                <div>
                                  <span>Số điện thoại</span>
                                  <strong>{selectedReturn.user?.phone || "—"}</strong>
                                </div>
                              </div>
                            </div>

                            <div className="admin-chat-return-section">
                              <h5>Sản phẩm trong yêu cầu</h5>

                              {returnItems.length === 0 ? (
                                <p>Không có thông tin sản phẩm.</p>
                              ) : (
                                returnItems.map((item) => {
                                  const orderItem = getOrderItem(item);
                                  const exchangeVariant = getExchangeVariant(item);

                                  return (
                                    <div
                                      className="admin-chat-return-product"
                                      key={item.id}
                                    >
                                      <div className="admin-chat-return-product-heading">
                                        <strong>
                                          {orderItem.productName || "Sản phẩm"}
                                        </strong>

                                        <span
                                          className={`admin-chat-return-badge ${getStatusClass(
                                            item.status
                                          )}`}
                                        >
                                          {RETURN_ITEM_STATUS_LABELS[item.status] ||
                                            item.status}
                                        </span>
                                      </div>

                                      <div className="admin-chat-return-readonly-grid">
                                        <div>
                                          <span>Phân loại đã mua</span>
                                          <strong>
                                            {orderItem.variantName || "—"}
                                          </strong>
                                        </div>

                                        <div>
                                          <span>SKU</span>
                                          <strong>{orderItem.sku || "—"}</strong>
                                        </div>

                                        <div>
                                          <span>Số lượng theo đơn</span>
                                          <strong>{orderItem.quantity ?? "—"}</strong>
                                        </div>

                                        <div>
                                          <span>Số lượng yêu cầu</span>
                                          <strong>{item.quantity ?? "—"}</strong>
                                        </div>

                                        <div>
                                          <span>Đơn giá</span>
                                          <strong>
                                            {formatCurrency(orderItem.unitPrice)}
                                          </strong>
                                        </div>

                                        <div>
                                          <span>Giảm giá phân bổ</span>
                                          <strong>
                                            {formatCurrency(orderItem.discountAmount)}
                                          </strong>
                                        </div>
                                      </div>

                                      {selectedReturn.resolution === "EXCHANGE" && (
                                        <div className="admin-chat-return-exchange-target">
                                          <span>Phiên bản muốn đổi</span>
                                          <strong>
                                            {exchangeVariant?.product?.name ||
                                              orderItem.productName ||
                                              "—"}
                                            {" · "}
                                            {exchangeVariant?.name || "—"}
                                          </strong>
                                          <span>
                                            SKU: {exchangeVariant?.sku || "—"}
                                          </span>
                                          <span>
                                            Số lượng đổi:{" "}
                                            {item.exchangeQuantity ??
                                              item.quantity ??
                                              "—"}
                                          </span>
                                        </div>
                                      )}

                                      {item.conditionNote && (
                                        <div className="admin-chat-return-note">
                                          <span>Ghi chú tình trạng hàng</span>
                                          <p>{item.conditionNote}</p>
                                        </div>
                                      )}

                                      {item.rejectionReason && (
                                        <div className="admin-chat-return-note">
                                          <span>Lý do từ chối sản phẩm</span>
                                          <p>{item.rejectionReason}</p>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })
                              )}
                            </div>

                            <div className="admin-chat-return-section">
                              <h5>Lý do và ghi chú</h5>

                              <div className="admin-chat-return-note">
                                <span>Lý do khách hàng</span>
                                <p>{selectedReturn.reason || "—"}</p>
                              </div>

                              {selectedReturn.customerNote && (
                                <div className="admin-chat-return-note">
                                  <span>Ghi chú của khách hàng</span>
                                  <p>{selectedReturn.customerNote}</p>
                                </div>
                              )}

                              {selectedReturn.adminNote && (
                                <div className="admin-chat-return-note">
                                  <span>Ghi chú Admin</span>
                                  <p>{selectedReturn.adminNote}</p>
                                </div>
                              )}
                            </div>

                            {selectedReturn.refundAmount !== null &&
                              selectedReturn.refundAmount !== undefined && (
                                <div className="admin-chat-return-refund">
                                  <span>Số tiền hoàn dự kiến</span>
                                  <strong>
                                    {formatCurrency(selectedReturn.refundAmount)}
                                  </strong>
                                  <small>Không bao gồm phí vận chuyển.</small>
                                </div>
                              )}

                            {selectedReturn.replacementOrder && (
                              <div className="admin-chat-return-section">
                                <h5>Đơn hàng thay thế</h5>

                                <div className="admin-chat-return-readonly-grid">
                                  <div>
                                    <span>Mã đơn</span>
                                    <strong>
                                      {selectedReturn.replacementOrder.orderNumber}
                                    </strong>
                                  </div>

                                  <div>
                                    <span>Trạng thái</span>
                                    <strong>
                                      {selectedReturn.replacementOrder.status}
                                    </strong>
                                  </div>

                                  <div>
                                    <span>Phương thức thanh toán</span>
                                    <strong>
                                      {selectedReturn.replacementOrder.paymentMethod}
                                    </strong>
                                  </div>

                                  <div>
                                    <span>Ngày tạo</span>
                                    <strong>
                                      {formatDate(
                                        selectedReturn.replacementOrder.createdAt
                                      )}
                                    </strong>
                                  </div>
                                </div>
                              </div>
                            )}

                            <div className="admin-chat-return-next-step">
                              <strong>Hướng xử lý tiếp theo</strong>
                              <p>{getReturnActionDescription(selectedReturn)}</p>
                            </div>

                            <div className="admin-chat-return-actions">
                              {selectedReturn.status === "REQUESTED" && (
                                <>
                                  <button
                                    type="button"
                                    className="secondary danger"
                                    disabled={returnActionLoading}
                                    onClick={() => handleReturnAction("reject")}
                                  >
                                    Từ chối
                                  </button>

                                  <button
                                    type="button"
                                    className="primary"
                                    disabled={returnActionLoading}
                                    onClick={() => handleReturnAction("approve")}
                                  >
                                    Duyệt yêu cầu
                                  </button>
                                </>
                              )}

                              {selectedReturn.status === "APPROVED" && (
                                <button
                                  type="button"
                                  className="primary"
                                  disabled={returnActionLoading}
                                  onClick={() => handleReturnAction("receive")}
                                >
                                  Xác nhận đã nhận hàng
                                </button>
                              )}

                              {selectedReturn.status === "INSPECTING" && (
                                <>
                                  <button
                                    type="button"
                                    className="secondary danger"
                                    disabled={returnActionLoading}
                                    onClick={() => handleReturnAction("reject")}
                                  >
                                    Từ chối sau kiểm tra
                                  </button>

                                  <button
                                    type="button"
                                    className="primary"
                                    disabled={returnActionLoading}
                                    onClick={() => handleReturnAction("accept")}
                                  >
                                    Chấp nhận sản phẩm
                                  </button>
                                </>
                              )}

                              {selectedReturn.status === "REFUND_PENDING" && (
                                <button
                                  type="button"
                                  className="primary"
                                  disabled={returnActionLoading}
                                  onClick={() =>
                                    handleReturnAction("confirmRefund")
                                  }
                                >
                                  Xác nhận đã hoàn tiền
                                </button>
                              )}

                              {selectedReturn.status === "WAITING_FOR_STOCK" && (
                                <button
                                  type="button"
                                  className="primary"
                                  disabled={returnActionLoading}
                                  onClick={() =>
                                    handleReturnAction("retryExchange")
                                  }
                                >
                                  Thử tạo đơn đổi hàng
                                </button>
                              )}

                              {returnActionLoading && (
                                <span className="admin-chat-return-loading">
                                  Đang xử lý...
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="admin-chat-profile-layout">
                      <aside className="admin-chat-profile-list">
                        <div className="admin-chat-return-list-heading">
                          <strong>Yêu cầu cập nhật hồ sơ</strong>

                          <button
                            type="button"
                            onClick={() => {
                              const customerId =
                                conversationData?.customer?.id ||
                                selectedConversationCustomerId(
                                  conversations,
                                  selectedId
                                );

                              loadProfileRequests({
                                page: profilePage,
                                customerId,
                              });
                            }}
                            disabled={profileListLoading}
                          >
                            ↻
                          </button>
                        </div>

                        <div className="admin-chat-list-content">
                          {profileError && (
                            <div
                              className="admin-chat-request-notice error"
                              role="alert"
                            >
                              {profileError}
                            </div>
                          )}

                          {profileNotice && (
                            <div
                              className="admin-chat-request-notice"
                              role="status"
                            >
                              {profileNotice}
                            </div>
                          )}

                          {profileListLoading ? (
                            <div className="admin-chat-empty">
                              Đang tải yêu cầu...
                            </div>
                          ) : profileRequests.length === 0 ? (
                            <div className="admin-chat-empty">
                              Khách hàng chưa có yêu cầu cập nhật hồ sơ.
                            </div>
                          ) : (
                            <div className="admin-chat-return-items">
                              {profileRequests.map((request) => (
                                <button
                                  type="button"
                                  key={request.id}
                                  className={`admin-chat-return-item ${selectedProfileRequestId === request.id
                                      ? "selected"
                                      : ""
                                    }`}
                                  onClick={() =>
                                    handleSelectProfileRequest(request)
                                  }
                                >
                                  <span className="admin-chat-return-item-top">
                                    <strong>
                                      {request.requestedFullName ||
                                        request.user?.fullName ||
                                        "Cập nhật số điện thoại"}
                                    </strong>

                                    <span
                                      className={`admin-chat-return-badge ${getStatusClass(
                                        request.status
                                      )}`}
                                    >
                                      {PROFILE_REQUEST_STATUS_LABELS[
                                        request.status
                                      ] || request.status}
                                    </span>
                                  </span>

                                  <span className="admin-chat-return-item-meta">
                                    {request.requestedPhone
                                      ? `SĐT mới: ${request.requestedPhone}`
                                      : "Yêu cầu cập nhật họ tên"}
                                  </span>

                                  <span className="admin-chat-return-item-date">
                                    Tạo ngày {formatDate(request.createdAt)}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {profilePagination.totalPages > 1 && (
                          <div className="admin-chat-pagination">
                            <button
                              type="button"
                              disabled={profilePage <= 1 || profileListLoading}
                              onClick={() => {
                                const nextPage = profilePage - 1;
                                setProfilePage(nextPage);

                                const customerId =
                                  conversationData?.customer?.id ||
                                  selectedConversationCustomerId(
                                    conversations,
                                    selectedId
                                  );

                                loadProfileRequests({
                                  page: nextPage,
                                  customerId,
                                });
                              }}
                            >
                              ←
                            </button>

                            <span>
                              {profilePage} / {profilePagination.totalPages}
                            </span>

                            <button
                              type="button"
                              disabled={
                                profilePage >= profilePagination.totalPages ||
                                profileListLoading
                              }
                              onClick={() => {
                                const nextPage = profilePage + 1;
                                setProfilePage(nextPage);

                                const customerId =
                                  conversationData?.customer?.id ||
                                  selectedConversationCustomerId(
                                    conversations,
                                    selectedId
                                  );

                                loadProfileRequests({
                                  page: nextPage,
                                  customerId,
                                });
                              }}
                            >
                              →
                            </button>
                          </div>
                        )}
                      </aside>

                      <div className="admin-chat-profile-detail">
                        {!selectedProfileRequestId ? (
                          <div className="admin-chat-empty">
                            Chọn một yêu cầu để xem chi tiết.
                          </div>
                        ) : profileDetailLoading ? (
                          <div className="admin-chat-empty">
                            Đang tải chi tiết yêu cầu...
                          </div>
                        ) : !selectedProfileRequest ? (
                          <div className="admin-chat-empty">
                            Không tải được chi tiết yêu cầu.
                          </div>
                        ) : (
                          <>
                            <div className="admin-chat-return-detail-heading">
                              <div>
                                <span className="admin-chat-request-eyebrow">
                                  MEMBER PROFILE REQUEST
                                </span>

                                <h4>Yêu cầu cập nhật hồ sơ</h4>

                                <span>
                                  Tạo ngày{" "}
                                  {formatDate(selectedProfileRequest.createdAt)}
                                </span>
                              </div>

                              <span
                                className={`admin-chat-return-badge ${getStatusClass(
                                  selectedProfileRequest.status
                                )}`}
                              >
                                {PROFILE_REQUEST_STATUS_LABELS[
                                  selectedProfileRequest.status
                                ] || selectedProfileRequest.status}
                              </span>
                            </div>

                            <div className="admin-chat-return-section">
                              <h5>Thông tin tài khoản hiện tại</h5>

                              <div className="admin-chat-return-readonly-grid">
                                <div>
                                  <span>Họ tên</span>
                                  <strong>
                                    {selectedProfileRequest.user?.fullName || "—"}
                                  </strong>
                                </div>

                                <div>
                                  <span>Email</span>
                                  <strong>
                                    {selectedProfileRequest.user?.email || "—"}
                                  </strong>
                                </div>

                                <div>
                                  <span>Số điện thoại</span>
                                  <strong>
                                    {selectedProfileRequest.user?.phone ||
                                      "Chưa cập nhật"}
                                  </strong>
                                </div>
                              </div>
                            </div>

                            <div className="admin-chat-return-section">
                              <h5>Thông tin khách hàng muốn thay đổi</h5>

                              <div className="admin-chat-profile-changes">
                                <div>
                                  <span>Họ tên mới</span>
                                  <strong>
                                    {selectedProfileRequest.requestedFullName ||
                                      "Không yêu cầu thay đổi"}
                                  </strong>
                                </div>

                                <div>
                                  <span>Số điện thoại mới</span>
                                  <strong>
                                    {selectedProfileRequest.requestedPhone ||
                                      "Không yêu cầu thay đổi"}
                                  </strong>
                                </div>
                              </div>
                            </div>

                            <div className="admin-chat-return-section">
                              <h5>Thông tin xử lý</h5>

                              <div className="admin-chat-return-readonly-grid">
                                <div>
                                  <span>Trạng thái</span>
                                  <strong>
                                    {PROFILE_REQUEST_STATUS_LABELS[
                                      selectedProfileRequest.status
                                    ] || selectedProfileRequest.status}
                                  </strong>
                                </div>

                                <div>
                                  <span>Người xử lý</span>
                                  <strong>
                                    {selectedProfileRequest.processedBy?.fullName ||
                                      "—"}
                                  </strong>
                                </div>

                                <div>
                                  <span>Thời gian xử lý</span>
                                  <strong>
                                    {formatDate(selectedProfileRequest.processedAt)}
                                  </strong>
                                </div>
                              </div>

                              {selectedProfileRequest.adminNote && (
                                <div className="admin-chat-return-note">
                                  <span>Ghi chú Admin</span>
                                  <p>{selectedProfileRequest.adminNote}</p>
                                </div>
                              )}
                            </div>

                            {selectedProfileRequest.status === "REQUESTED" && (
                              <div className="admin-chat-return-actions">
                                <button
                                  type="button"
                                  className="secondary danger"
                                  disabled={profileActionLoading}
                                  onClick={() =>
                                    handleProfileRequestAction("reject")
                                  }
                                >
                                  Từ chối
                                </button>

                                <button
                                  type="button"
                                  className="primary"
                                  disabled={profileActionLoading}
                                  onClick={() =>
                                    handleProfileRequestAction("approve")
                                  }
                                >
                                  Duyệt và cập nhật hồ sơ
                                </button>

                                {profileActionLoading && (
                                  <span className="admin-chat-return-loading">
                                    Đang xử lý...
                                  </span>
                                )}
                              </div>
                            )}

                            {selectedProfileRequest.status !== "REQUESTED" && (
                              <div className="admin-chat-return-next-step">
                                <strong>Yêu cầu đã được xử lý</strong>
                                <p>
                                  {selectedProfileRequest.status === "APPROVED"
                                    ? "Thông tin tài khoản đã được cập nhật theo yêu cầu."
                                    : "Yêu cầu cập nhật hồ sơ đã bị từ chối."}
                                </p>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              ) : (
                <>
                  <div
                    className="admin-chat-message-list"
                    ref={messageListRef}
                  >
                    {nextCursor && (
                      <button
                        type="button"
                        className="admin-chat-load-older"
                        onClick={handleLoadOlderMessages}
                        disabled={olderLoading}
                      >
                        {olderLoading
                          ? "Đang tải..."
                          : "Tải tin nhắn cũ hơn"}
                      </button>
                    )}

                    {messagesLoading ? (
                      <div className="admin-chat-empty">
                        Đang tải tin nhắn...
                      </div>
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
                            className={`admin-chat-message-row ${isAdmin ? "outgoing" : "incoming"
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
                          onChange={(event) =>
                            setMessageInput(event.target.value)
                          }
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
                          <span>
                            {messageInput.length}/2000 · Enter để gửi, Shift + Enter xuống dòng
                          </span>

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
                </>
              )}
            </>
          )}
        </main>
      </div>
    </section>
  );
}

function selectedConversationCustomerId(conversations, selectedId) {
  return (
    conversations.find((item) => item.id === selectedId)?.customer?.id ||
    null
  );
}
