
import { useEffect, useRef, useState } from "react";

import {
    getMemberChatMessages,
    sendMemberChatMessage,
} from "../../services/chat.service";

import {
    getCustomerCatalogProduct,
} from "../../services/catalog.service";

import {
    createMemberReturnRequest,
    getMemberReturnRequests,
    getMemberEligibleReturnOrders,
} from "../../services/return.service";

import {
    createMemberProfileRequest,
    getMemberProfileRequests,
} from "../../services/member-profile-request.service";

import "../../pages/storefront/storefront.css";
import "../../pages/storefront/storefront-support.css";

export default function CustomerSupportWidget({
    user,
    accessToken,
    onSessionRefresh,
    onSessionExpired,
    isOpen,
    onOpenChange,
}) {
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState("");
    const [chatLoading, setChatLoading] = useState(false);
    const [chatSending, setChatSending] = useState(false);
    const [chatError, setChatError] = useState("");

    const chatTokenRef = useRef(accessToken);

    const [supportTab, setSupportTab] = useState("CHAT");

    // Return
    const [memberOrders, setMemberOrders] = useState([]);
    const [returnRequests, setReturnRequests] = useState([]);
    const [returnLoading, setReturnLoading] = useState(false);
    const [returnSubmitting, setReturnSubmitting] = useState(false);
    const [returnError, setReturnError] = useState("");
    const [returnNotice, setReturnNotice] = useState("");

    const [selectedReturnItems, setSelectedReturnItems] = useState([]);
    const [selectedReturnOrderId, setSelectedReturnOrderId] = useState("");

    const [exchangeVariantsByItem, setExchangeVariantsByItem] = useState({});
    const [exchangeVariantsLoading, setExchangeVariantsLoading] = useState({});
    const [exchangeVariantsError, setExchangeVariantsError] = useState({});

    // Profile
    const [profileRequests, setProfileRequests] = useState([]);
    const [profileLoading, setProfileLoading] = useState(false);
    const [profileSubmitting, setProfileSubmitting] = useState(false);
    const [profileError, setProfileError] = useState("");
    const [profileNotice, setProfileNotice] = useState("");

    const [profileForm, setProfileForm] = useState({
        requestedFullName: "",
        requestedPhone: "",
    });

    const [profileEditMode, setProfileEditMode] = useState("BOTH");

    useEffect(() => {
        chatTokenRef.current = accessToken;
    }, [accessToken]);

    useEffect(() => {
        if (!isOpen || !user || !accessToken) return;

        loadChatMessages();
    }, [isOpen, user?.id, accessToken]);

    useEffect(() => {
        if (!isOpen || !user || !accessToken) return;

        if (supportTab === "RETURN") {
            loadReturnData();
        }

        if (supportTab === "PROFILE") {
            loadProfileRequests();
        }
    }, [isOpen, supportTab, user?.id, accessToken]);

    useEffect(() => {
        let cancelled = false;

        async function loadVariants() {
            const exchangeItems = selectedReturnItems.filter(
                (item) => item.resolution === "EXCHANGE"
            );

            if (exchangeItems.length === 0) {
                setExchangeVariantsByItem({});
                setExchangeVariantsLoading({});
                setExchangeVariantsError({});
                return;
            }

            const selectedOrder = memberOrders.find(
                (order) => order.id === selectedReturnOrderId
            );

            const loadingMap = {};
            const variantsMap = {};
            const errorsMap = {};

            for (const item of exchangeItems) {
                loadingMap[item.orderItemId] = true;
            }

            setExchangeVariantsLoading(loadingMap);
            setExchangeVariantsError({});

            const results = await Promise.all(
                exchangeItems.map(async (returnItem) => {
                    const orderItem = selectedOrder?.items?.find(
                        (item) => item.id === returnItem.orderItemId
                    );

                    if (!orderItem?.productId) {
                        return {
                            orderItemId: returnItem.orderItemId,
                            variants: [],
                            error: "Không xác định được sản phẩm.",
                        };
                    }

                    try {
                        const result = await getCustomerCatalogProduct(
                            orderItem.productId
                        );

                        const variants = Array.isArray(result?.data?.variants)
                            ? result.data.variants.filter(
                                (variant) => variant.id !== orderItem.variantId
                            )
                            : [];

                        return {
                            orderItemId: returnItem.orderItemId,
                            variants,
                            error: "",
                        };
                    } catch (error) {
                        return {
                            orderItemId: returnItem.orderItemId,
                            variants: [],
                            error: error.message || "Không thể tải phiên bản đổi.",
                        };
                    }
                })
            );

            if (cancelled) return;

            for (const result of results) {
                variantsMap[result.orderItemId] = result.variants;
                errorsMap[result.orderItemId] = result.error;
                loadingMap[result.orderItemId] = false;
            }

            setExchangeVariantsByItem(variantsMap);
            setExchangeVariantsError(errorsMap);
            setExchangeVariantsLoading(loadingMap);
        }

        loadVariants();

        return () => {
            cancelled = true;
        };
    }, [selectedReturnItems, selectedReturnOrderId, memberOrders]);

    function formatChatTime(value) {
        if (!value) return "";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "";

        return new Intl.DateTimeFormat("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
        }).format(date);
    }

    async function refreshChatSession() {
        if (!onSessionRefresh) {
            throw new Error("Không thể làm mới phiên đăng nhập.");
        }

        const session = await onSessionRefresh();

        if (session?.accessToken) {
            chatTokenRef.current = session.accessToken;
        }

        return session;
    }

    function handleChatClick() {
        onOpenChange?.(!isOpen);
    }

    async function loadChatMessages() {
        if (!chatTokenRef.current) return;

        setChatLoading(true);
        setChatError("");

        try {
            const result = await getMemberChatMessages({
                accessToken: chatTokenRef.current,
                onSessionRefresh: refreshChatSession,
                onSessionExpired,
                limit: 50,
            });

            setChatMessages(
                Array.isArray(result.items) ? result.items : []
            );
        } catch (error) {
            setChatError(
                error.message || "Không thể tải lịch sử trò chuyện."
            );
        } finally {
            setChatLoading(false);
        }
    }

    async function handleSendChat(event) {
        event.preventDefault();

        const content = chatInput.trim();

        if (!content || chatSending || !chatTokenRef.current) return;

        setChatSending(true);
        setChatError("");

        try {
            const result = await sendMemberChatMessage({
                content,
                accessToken: chatTokenRef.current,
                onSessionRefresh: refreshChatSession,
                onSessionExpired,
            });

            if (result.message) {
                setChatMessages((current) => [
                    ...current,
                    result.message,
                ]);
            }

            setChatInput("");
        } catch (error) {
            setChatError(
                error.message || "Không thể gửi tin nhắn. Vui lòng thử lại."
            );
        } finally {
            setChatSending(false);
        }
    }

    function getResponseItems(result) {
        if (Array.isArray(result)) return result;
        if (Array.isArray(result?.items)) return result.items;
        if (Array.isArray(result?.data)) return result.data;
        if (Array.isArray(result?.data?.items)) return result.data.items;
        return [];
    }

    function getErrorMessage(error, fallback) {
        return error?.message || fallback;
    }

    function formatSupportDate(value) {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "—";

        return date.toLocaleString("vi-VN");
    }

    function formatSupportMoney(value) {
        const amount = Number(value || 0);

        return new Intl.NumberFormat("vi-VN", {
            style: "currency",
            currency: "VND",
        }).format(amount);
    }

    const selectedReturnOrder = memberOrders.find(
        (order) => order.id === selectedReturnOrderId
    );

    function getReturnItemDraft(orderItemId) {
        return selectedReturnItems.find(
            (item) => item.orderItemId === orderItemId
        );
    }

    function toggleReturnItem(orderItem) {
        setReturnError("");
        setReturnNotice("");

        setSelectedReturnItems((current) => {
            const exists = current.some(
                (item) => item.orderItemId === orderItem.id
            );

            if (exists) {
                return current.filter(
                    (item) => item.orderItemId !== orderItem.id
                );
            }

            return [
                ...current,
                {
                    orderItemId: orderItem.id,
                    quantity: 1,
                    resolution: "REFUND",
                    exchangeVariantId: "",
                    reason: "",
                    customerNote: "",
                },
            ];
        });
    }

    function updateReturnItem(orderItemId, changes) {
        setSelectedReturnItems((current) =>
            current.map((item) =>
                item.orderItemId === orderItemId
                    ? { ...item, ...changes }
                    : item
            )
        );

        setReturnError("");
    }

    function changeReturnOrder(orderId) {
        setSelectedReturnOrderId(orderId);
        setSelectedReturnItems([]);
        setExchangeVariantsByItem({});
        setExchangeVariantsError({});
        setReturnError("");
        setReturnNotice("");
    }

    async function loadReturnData() {
        if (!user || !accessToken) return;

        setReturnLoading(true);
        setReturnError("");

        try {
            const [ordersResult, requestsResult] = await Promise.all([
                getMemberEligibleReturnOrders({
                    accessToken: chatTokenRef.current,
                    onSessionRefresh: refreshChatSession,
                    onSessionExpired,
                }),
                getMemberReturnRequests({
                    accessToken: chatTokenRef.current,
                    onSessionRefresh: refreshChatSession,
                    onSessionExpired,
                    page: 1,
                    limit: 50,
                }),
            ]);

            setMemberOrders(getResponseItems(ordersResult));
            setReturnRequests(getResponseItems(requestsResult));
        } catch (error) {
            setReturnError(
                getErrorMessage(error, "Không thể tải thông tin đổi/trả.")
            );
        } finally {
            setReturnLoading(false);
        }
    }


    async function handleCreateReturnRequest(event) {
        event.preventDefault();

        if (returnSubmitting) return;

        if (!selectedReturnOrderId) {
            setReturnError("Vui lòng chọn đơn hàng.");
            return;
        }

        if (selectedReturnItems.length === 0) {
            setReturnError("Vui lòng chọn ít nhất một sản phẩm cần đổi/trả.");
            return;
        }

        const invalidItem = selectedReturnItems.find((item) => {
            const orderItem = selectedReturnOrder?.items?.find(
                (candidate) => candidate.id === item.orderItemId
            );

            return (
                !orderItem ||
                !Number.isSafeInteger(Number(item.quantity)) ||
                Number(item.quantity) < 1 ||
                Number(item.quantity) > Number(orderItem.quantity) ||
                !item.reason.trim() ||
                item.reason.trim().length < 3 ||
                (
                    item.resolution === "EXCHANGE" &&
                    (
                        !item.exchangeVariantId ||
                        !(exchangeVariantsByItem[item.orderItemId] || []).some(
                            (variant) => variant.id === item.exchangeVariantId
                        )
                    )
                )
            );
        });

        if (invalidItem) {
            setReturnError(
                "Vui lòng kiểm tra số lượng, lý do và phiên bản đổi của từng sản phẩm."
            );
            return;
        }

        setReturnSubmitting(true);
        setReturnError("");
        setReturnNotice("");

        try {
            const payload = {
                orderId: selectedReturnOrderId,
                items: selectedReturnItems.map((item) => ({
                    orderItemId: item.orderItemId,
                    quantity: Number(item.quantity),
                    resolution: item.resolution,
                    reason: item.reason.trim(),
                    customerNote: item.customerNote.trim() || undefined,
                    exchangeVariantId:
                        item.resolution === "EXCHANGE"
                            ? item.exchangeVariantId
                            : undefined,
                })),
                accessToken: chatTokenRef.current,
                onSessionRefresh: refreshChatSession,
                onSessionExpired,
            };

            await createMemberReturnRequest(payload);

            setReturnNotice(
                `Đã gửi thành công ${selectedReturnItems.length} yêu cầu đổi/trả. Mỗi sản phẩm sẽ được cửa hàng xử lý riêng.`
            );

            setSelectedReturnOrderId("");
            setSelectedReturnItems([]);
            setExchangeVariantsByItem({});
            setExchangeVariantsError({});

            await loadReturnData();
        } catch (error) {
            setReturnError(
                getErrorMessage(error, "Không thể gửi yêu cầu đổi/trả.")
            );
        } finally {
            setReturnSubmitting(false);
        }
    }

    async function loadProfileRequests() {
        if (!user || !accessToken) return;

        setProfileLoading(true);
        setProfileError("");

        try {
            const result = await getMemberProfileRequests({
                accessToken: chatTokenRef.current,
                onSessionRefresh: refreshChatSession,
                onSessionExpired,
                page: 1,
                limit: 50,
            });

            setProfileRequests(getResponseItems(result));
        } catch (error) {
            setProfileError(
                getErrorMessage(error, "Không thể tải lịch sử yêu cầu hồ sơ.")
            );
        } finally {
            setProfileLoading(false);
        }
    }

    async function handleCreateProfileRequest(event) {
        event.preventDefault();

        if (profileSubmitting) return;

        const fullName = profileForm.requestedFullName.trim();
        const phone = profileForm.requestedPhone.trim();

        if (!fullName && !phone) {
            setProfileError("Bạn cần nhập ít nhất một thông tin muốn cập nhật.");
            return;
        }

        setProfileSubmitting(true);
        setProfileError("");
        setProfileNotice("");

        try {
            await createMemberProfileRequest({
                requestedFullName: fullName || undefined,
                requestedPhone: phone || undefined,
                accessToken: chatTokenRef.current,
                onSessionRefresh: refreshChatSession,
                onSessionExpired,
            });

            setProfileNotice("Đã gửi yêu cầu cập nhật hồ sơ.");

            setProfileForm({
                requestedFullName: "",
                requestedPhone: "",
            });

            await loadProfileRequests();
        } catch (error) {
            setProfileError(
                getErrorMessage(error, "Không thể gửi yêu cầu cập nhật hồ sơ.")
            );
        } finally {
            setProfileSubmitting(false);
        }
    }

    function getOrderLabel(order) {
        return order?.orderNumber || order?.code || order?.id || "Đơn hàng";
    }

    function getOrderItemLabel(item) {
        const productName =
            item?.productName || item?.product?.name || item?.name || "Sản phẩm";
        const variantName =
            item?.variantName || item?.variant?.name || "";
        const sku = item?.sku || item?.variant?.sku || "";

        return [productName, variantName, sku ? `SKU: ${sku}` : ""]
            .filter(Boolean)
            .join(" · ");
    }

    function getRequestStatusLabel(status) {
        const labels = {
            REQUESTED: "Đang chờ duyệt",
            APPROVED: "Đã chấp thuận",
            REJECTED: "Đã từ chối",
            INSPECTING: "Đang kiểm tra sản phẩm",
            REFUND_PENDING: "Chờ hoàn tiền",
            WAITING_FOR_STOCK: "Chờ bổ sung hàng",
            REPLACEMENT_PENDING: "Đang chuẩn bị hàng đổi",
            COMPLETED: "Đã hoàn tất",
            CANCELLED: "Đã hủy",
        };

        return labels[status] || status || "Chưa xác định";
    }

    function getRequestIdLabel(request) {
        return (
            request?.requestNumber ||
            request?.returnRequestNumber ||
            request?.code ||
            request?.id ||
            "Yêu cầu"
        );
    }

    if (!user) return null;

    return (
        <>
            <button
                className={`store-chat-fab ${isOpen ? "active" : ""}`}
                onClick={handleChatClick}
                aria-label="Chat hỗ trợ khách hàng"
                title="Chat hỗ trợ"
            >
                {isOpen ? "×" : "✉"}
                {!isOpen && <span>Hỗ trợ</span>}
            </button>

            {isOpen && (
                <section
                    className="store-chat-panel"
                    aria-label="Trung tâm hỗ trợ QMD Sport"
                >
                    <header className="store-chat-panel-header">
                        <div className="store-chat-panel-brand">
                            <div className="store-chat-panel-avatar">Q</div>
                            <div>
                                <strong>QMD SPORT SUPPORT</strong>
                                <small><span /> Đội ngũ hỗ trợ</small>
                            </div>
                        </div>

                        <button
                            type="button"
                            className="store-chat-panel-close"
                            onClick={() => onOpenChange?.(false)}
                            aria-label="Đóng cửa sổ hỗ trợ"
                        >
                            ×
                        </button>
                    </header>

                    <nav className="store-support-tabs" aria-label="Các mục hỗ trợ">
                        <button
                            type="button"
                            className={supportTab === "CHAT" ? "active" : ""}
                            aria-current={supportTab === "CHAT" ? "page" : undefined}
                            onClick={() => setSupportTab("CHAT")}
                        >
                            Tin nhắn
                        </button>

                        <button
                            type="button"
                            className={supportTab === "RETURN" ? "active" : ""}
                            aria-current={supportTab === "RETURN" ? "page" : undefined}
                            onClick={() => setSupportTab("RETURN")}
                        >
                            Đổi / Trả
                        </button>

                        <button
                            type="button"
                            className={supportTab === "PROFILE" ? "active" : ""}
                            aria-current={supportTab === "PROFILE" ? "page" : undefined}
                            onClick={() => setSupportTab("PROFILE")}
                        >
                            Hồ sơ
                        </button>
                    </nav>

                    {supportTab === "CHAT" && (
                        <div className="store-support-content store-support-chat-content">
                            <div className="store-chat-panel-messages">


                                <div className="store-support-choice-group">
                                    <div className="store-support-choice-title">
                                        Bạn cần hỗ trợ về vấn đề gì?
                                    </div>
                                    <div className="store-support-choice-list">
                                        {[
                                            {
                                                label: "Tư vấn sản phẩm",
                                                message: "Tôi cần tư vấn sản phẩm cầu lông/pickleball.",
                                            },
                                            {
                                                label: "Theo dõi đơn hàng",
                                                message: "Tôi muốn kiểm tra tình trạng đơn hàng.",
                                            },
                                            {
                                                label: "Thanh toán",
                                                message: "Tôi cần hỗ trợ về vấn đề thanh toán.",
                                            },
                                            {
                                                label: "Đổi / trả hàng",
                                                message: "Tôi cần tư vấn về việc đổi hoặc trả sản phẩm.",
                                            },
                                            {
                                                label: "Vấn đề khác",
                                                message: "Tôi có câu hỏi khác cần được hỗ trợ.",
                                            },
                                        ].map((topic) => (
                                            <button
                                                key={topic.label}
                                                type="button"
                                                className="store-support-choice-button"
                                                onClick={() => setChatInput(topic.message)}
                                                disabled={chatSending}
                                            >
                                                {topic.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="store-chat-date">HỘI THOẠI HỖ TRỢ</div>

                                {chatLoading && chatMessages.length === 0 && (
                                    <div className="store-chat-date">
                                        ĐANG TẢI TIN NHẮN...
                                    </div>
                                )}

                                {!chatLoading && chatMessages.length === 0 && !chatError && (
                                    <div className="store-chat-date">
                                        Hãy gửi tin nhắn để bắt đầu trò chuyện với QMD Sport
                                    </div>
                                )}

                                {chatMessages.map((message) => {
                                    const isMine =
                                        message.sender?.role === "CUSTOMER" ||
                                        message.senderId === user?.id;

                                    return (
                                        <div
                                            key={message.id}
                                            className={`store-chat-message ${isMine ? "mine" : "theirs"}`}
                                        >
                                            <p>{message.content}</p>
                                            <time>{formatChatTime(message.createdAt)}</time>
                                        </div>
                                    );
                                })}

                                {chatError && (
                                    <div className="store-chat-date store-support-error">
                                        {chatError}
                                        <button type="button" onClick={loadChatMessages}>
                                            Thử tải lại
                                        </button>
                                    </div>
                                )}
                            </div>

                            <form
                                className="store-chat-panel-compose"
                                onSubmit={handleSendChat}
                            >
                                <input
                                    value={chatInput}
                                    onChange={(event) => setChatInput(event.target.value)}
                                    placeholder="Nhập tin nhắn..."
                                    maxLength={2000}
                                    disabled={chatSending || chatLoading}
                                />

                                <button
                                    type="submit"
                                    disabled={!chatInput.trim() || chatSending || chatLoading}
                                    aria-label="Gửi tin nhắn"
                                >
                                    {chatSending ? "…" : "↗"}
                                </button>
                            </form>

                            <div className="store-chat-demo-note">
                                Tin nhắn được lưu trong hội thoại hỗ trợ của bạn.
                            </div>
                        </div>
                    )}

                    {supportTab === "RETURN" && (
                        <div className="store-support-content">
                            <div className="store-support-intro">
                                <span className="store-support-eyebrow">ORDER SUPPORT</span>
                                <h3>Đổi / Trả sản phẩm</h3>
                                <p>
                                    Bạn có thể gửi yêu cầu hoàn tiền hoặc đổi sang phiên bản
                                    khác của cùng sản phẩm. Yêu cầu cần được gửi trong vòng
                                    3 ngày kể từ ngày nhận hàng.
                                </p>
                                <p className="store-support-hint">
                                    Mỗi sản phẩm trong đơn hàng chỉ được gửi yêu cầu đổi/trả
                                    một lần. Yêu cầu sẽ được cửa hàng kiểm tra trước khi xử lý.
                                </p>
                            </div>

                            {returnError && (
                                <div className="store-support-alert error" role="alert">
                                    {returnError}
                                </div>
                            )}

                            {returnNotice && (
                                <div className="store-support-alert success" role="status">
                                    {returnNotice}
                                </div>
                            )}

                            <form
                                className="store-support-form"
                                onSubmit={handleCreateReturnRequest}
                            >
                                <label>
                                    <span>Đơn hàng <b>*</b></span>
                                    <select
                                        value={selectedReturnOrderId}
                                        onChange={(event) => changeReturnOrder(event.target.value)}
                                        required
                                        disabled={
                                            returnLoading ||
                                            returnSubmitting ||
                                            memberOrders.length === 0
                                        }
                                    >
                                        <option value="">-- Chọn đơn hàng --</option>
                                        {memberOrders.map((order) => (
                                            <option key={order.id} value={order.id}>
                                                {getOrderLabel(order)}
                                                {order.status ? ` · ${order.status}` : ""}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                {selectedReturnOrder && (
                                    <>
                                        <div className="store-support-choice-group">
                                            <div className="store-support-choice-title">
                                                Chọn sản phẩm cần đổi / trả
                                            </div>

                                            <p className="store-support-hint">
                                                Bạn có thể chọn nhiều sản phẩm trong cùng một đơn hàng.
                                                Mỗi sản phẩm sẽ tạo một yêu cầu riêng.
                                            </p>

                                            <div className="store-support-request-list">
                                                {(selectedReturnOrder.items || []).map((orderItem) => {
                                                    const selected = !!getReturnItemDraft(orderItem.id);

                                                    return (
                                                        <label
                                                            key={orderItem.id}
                                                            className={`store-support-request ${selected ? "active" : ""}`}
                                                            style={{
                                                                display: "flex",
                                                                alignItems: "flex-start",
                                                                gap: 10,
                                                                cursor: "pointer",
                                                            }}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={selected}
                                                                onChange={() => toggleReturnItem(orderItem)}
                                                                disabled={returnSubmitting}
                                                            />

                                                            <span>
                                                                <strong>
                                                                    {getOrderItemLabel(orderItem)}
                                                                </strong>
                                                                <small>
                                                                    Số lượng trong đơn: {orderItem.quantity}
                                                                </small>
                                                                {orderItem.unitPrice != null && (
                                                                    <small>
                                                                        Đơn giá: {formatSupportMoney(orderItem.unitPrice)}
                                                                    </small>
                                                                )}
                                                            </span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {selectedReturnItems.map((draft) => {
                                            const orderItem = selectedReturnOrder.items?.find(
                                                (item) => item.id === draft.orderItemId
                                            );

                                            if (!orderItem) return null;

                                            const variants =
                                                exchangeVariantsByItem[draft.orderItemId] || [];

                                            return (
                                                <section
                                                    key={draft.orderItemId}
                                                    className="store-support-selected-item"
                                                >
                                                    <strong>{getOrderItemLabel(orderItem)}</strong>

                                                    <label>
                                                        <span>Số lượng cần đổi / trả <b>*</b></span>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max={orderItem.quantity}
                                                            step="1"
                                                            value={draft.quantity}
                                                            onChange={(event) =>
                                                                updateReturnItem(draft.orderItemId, {
                                                                    quantity: event.target.value,
                                                                })
                                                            }
                                                            required
                                                            disabled={returnSubmitting}
                                                        />
                                                    </label>

                                                    <div className="store-support-resolution">
                                                        <span className="store-support-field-title">
                                                            Hình thức xử lý <b>*</b>
                                                        </span>

                                                        <div className="store-support-resolution-options">
                                                            <label className={draft.resolution === "REFUND" ? "active" : ""}>
                                                                <input
                                                                    type="radio"
                                                                    name={`resolution-${draft.orderItemId}`}
                                                                    value="REFUND"
                                                                    checked={draft.resolution === "REFUND"}
                                                                    onChange={() =>
                                                                        updateReturnItem(draft.orderItemId, {
                                                                            resolution: "REFUND",
                                                                            exchangeVariantId: "",
                                                                        })
                                                                    }
                                                                    disabled={returnSubmitting}
                                                                />
                                                                <span>
                                                                    <strong>Hoàn tiền</strong>
                                                                    <small>Nhận lại tiền theo giá trị được duyệt</small>
                                                                </span>
                                                            </label>

                                                            <label className={draft.resolution === "EXCHANGE" ? "active" : ""}>
                                                                <input
                                                                    type="radio"
                                                                    name={`resolution-${draft.orderItemId}`}
                                                                    value="EXCHANGE"
                                                                    checked={draft.resolution === "EXCHANGE"}
                                                                    onChange={() =>
                                                                        updateReturnItem(draft.orderItemId, {
                                                                            resolution: "EXCHANGE",
                                                                            exchangeVariantId: "",
                                                                        })
                                                                    }
                                                                    disabled={returnSubmitting}
                                                                />
                                                                <span>
                                                                    <strong>Đổi phiên bản</strong>
                                                                    <small>Đổi sang phiên bản khác của cùng sản phẩm</small>
                                                                </span>
                                                            </label>
                                                        </div>
                                                    </div>

                                                    {draft.resolution === "EXCHANGE" && (
                                                        <label>
                                                            <span>Phiên bản muốn đổi sang <b>*</b></span>
                                                            <select
                                                                value={draft.exchangeVariantId}
                                                                onChange={(event) =>
                                                                    updateReturnItem(draft.orderItemId, {
                                                                        exchangeVariantId: event.target.value,
                                                                    })
                                                                }
                                                                required
                                                                disabled={
                                                                    returnSubmitting ||
                                                                    !!exchangeVariantsLoading[draft.orderItemId] ||
                                                                    !!exchangeVariantsError[draft.orderItemId] ||
                                                                    !variants.length
                                                                }
                                                            >
                                                                <option value="">
                                                                    -- Chọn phiên bản muốn đổi --
                                                                </option>
                                                                {variants.map((variant) => (
                                                                    <option key={variant.id} value={variant.id}>
                                                                        {variant.name}
                                                                        {variant.inStock
                                                                            ? " · Còn hàng"
                                                                            : " · Hết hàng, chờ bổ sung"}
                                                                    </option>
                                                                ))}
                                                            </select>

                                                            {exchangeVariantsError[draft.orderItemId] && (
                                                                <small className="store-support-alert error">
                                                                    {exchangeVariantsError[draft.orderItemId]}
                                                                </small>
                                                            )}

                                                            {exchangeVariantsLoading[draft.orderItemId] && (
                                                                <small className="store-support-hint">
                                                                    Đang tải danh sách phiên bản...
                                                                </small>
                                                            )}

                                                            {!exchangeVariantsLoading[draft.orderItemId] &&
                                                                !exchangeVariantsError[draft.orderItemId] &&
                                                                variants.length === 0 && (
                                                                    <small className="store-support-hint">
                                                                        Không có phiên bản khác đang hoạt động để đổi.
                                                                    </small>
                                                                )}

                                                            {draft.exchangeVariantId &&
                                                                !exchangeVariantsLoading[draft.orderItemId] &&
                                                                !exchangeVariantsError[draft.orderItemId] && (
                                                                    <small className="store-support-hint">
                                                                        {variants.find(
                                                                            (variant) => variant.id === draft.exchangeVariantId
                                                                        )?.inStock
                                                                            ? "Phiên bản đang còn hàng. Cửa hàng sẽ kiểm tra khi tiếp nhận."
                                                                            : "Phiên bản hiện hết hàng. Yêu cầu có thể phải chờ bổ sung."}
                                                                    </small>
                                                                )}
                                                        </label>
                                                    )}

                                                    <label>
                                                        <span>
                                                            Lý do {draft.resolution === "EXCHANGE" ? "đổi hàng" : "hoàn tiền"}
                                                            {" "}<b>*</b>
                                                        </span>
                                                        <textarea
                                                            value={draft.reason}
                                                            onChange={(event) =>
                                                                updateReturnItem(draft.orderItemId, {
                                                                    reason: event.target.value,
                                                                })
                                                            }
                                                            minLength={3}
                                                            maxLength={500}
                                                            rows={3}
                                                            placeholder="Mô tả lý do..."
                                                            required
                                                            disabled={returnSubmitting}
                                                        />
                                                        <small className="store-support-field-hint">
                                                            {draft.reason.length}/500 ký tự
                                                        </small>
                                                    </label>

                                                    <label>
                                                        <span>Ghi chú thêm</span>
                                                        <textarea
                                                            value={draft.customerNote}
                                                            onChange={(event) =>
                                                                updateReturnItem(draft.orderItemId, {
                                                                    customerNote: event.target.value,
                                                                })
                                                            }
                                                            maxLength={2000}
                                                            rows={2}
                                                            placeholder="Thông tin bổ sung (không bắt buộc)..."
                                                            disabled={returnSubmitting}
                                                        />
                                                    </label>
                                                </section>
                                            );
                                        })}
                                    </>
                                )}

                                <button
                                    className="store-support-submit"
                                    type="submit"
                                    disabled={
                                        returnSubmitting ||
                                        returnLoading ||
                                        !selectedReturnOrderId ||
                                        selectedReturnItems.length === 0
                                    }
                                >
                                    {returnSubmitting
                                        ? "ĐANG GỬI..."
                                        : `GỬI ${selectedReturnItems.length || ""} YÊU CẦU ĐỔI / TRẢ`}
                                </button>
                            </form>

                            {returnLoading ? (
                                <div className="store-support-empty">
                                    Đang tải đơn hàng và yêu cầu...
                                </div>
                            ) : memberOrders.length === 0 ? (
                                <div className="store-support-empty">
                                    <strong>Chưa có đơn hàng đủ điều kiện đổi / trả</strong>
                                    <p>
                                        Bạn chỉ có thể gửi yêu cầu trong vòng 3 ngày kể từ ngày
                                        nhận hàng. Các sản phẩm đã từng có yêu cầu đổi / trả
                                        cũng không thể gửi yêu cầu lần nữa.
                                    </p>
                                </div>
                            ) : null}

                            <div className="store-support-history">
                                <div className="store-support-history-heading">
                                    <h4>Lịch sử yêu cầu đổi / trả</h4>
                                    <button
                                        type="button"
                                        onClick={loadReturnData}
                                        disabled={returnLoading}
                                    >
                                        Làm mới
                                    </button>
                                </div>

                                {returnLoading && returnRequests.length === 0 ? (
                                    <p className="store-support-muted">Đang tải lịch sử...</p>
                                ) : returnRequests.length === 0 ? (
                                    <p className="store-support-muted">
                                        Bạn chưa có yêu cầu nào.
                                    </p>
                                ) : (
                                    <div className="store-support-request-list">
                                        {returnRequests.map((request) => {
                                            const status = request.status || request.returnStatus;
                                            const itemLabel =
                                                request.items?.[0]?.orderItem?.productName ||
                                                request.items?.[0]?.orderItem?.product?.name ||
                                                request.orderItem?.productName ||
                                                request.item?.productName ||
                                                request.productName ||
                                                "Sản phẩm trong đơn hàng";

                                            return (
                                                <article className="store-support-request" key={request.id}>
                                                    <div className="store-support-request-top">
                                                        <strong>{getRequestIdLabel(request)}</strong>
                                                        <span className={`store-support-status status-${String(status || "").toLowerCase()}`}>
                                                            {getRequestStatusLabel(status)}
                                                        </span>
                                                    </div>

                                                    <p>{itemLabel}</p>

                                                    <p className="store-support-request-resolution">
                                                        {request.resolution === "EXCHANGE"
                                                            ? "Đổi phiên bản"
                                                            : request.resolution === "REFUND"
                                                                ? "Hoàn tiền"
                                                                : "Yêu cầu đổi / trả"}
                                                    </p>

                                                    <small>
                                                        {request.order?.orderNumber
                                                            ? `Đơn ${request.order.orderNumber} · `
                                                            : ""}
                                                        {formatSupportDate(
                                                            request.createdAt || request.requestedAt
                                                        )}
                                                    </small>

                                                    {request.reason && (
                                                        <p className="store-support-request-reason">
                                                            {request.reason}
                                                        </p>
                                                    )}
                                                </article>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {supportTab === "PROFILE" && (
                        <div className="store-support-content">
                            <div className="store-support-intro">
                                <span className="store-support-eyebrow">MEMBER PROFILE</span>
                                <h3>Yêu cầu cập nhật hồ sơ</h3>
                                <p>
                                    Gửi yêu cầu thay đổi họ tên hoặc số điện thoại. Thông tin
                                    tài khoản chỉ được cập nhật sau khi yêu cầu được duyệt.
                                </p>
                            </div>

                            {profileError && (
                                <div className="store-support-alert error" role="alert">
                                    {profileError}
                                </div>
                            )}

                            {profileNotice && (
                                <div className="store-support-alert success" role="status">
                                    {profileNotice}
                                </div>
                            )}

                            <form
                                className="store-support-form"
                                onSubmit={handleCreateProfileRequest}
                            >

                                <div className="store-support-choice-group">
                                    <div className="store-support-choice-title">
                                        Bạn muốn cập nhật thông tin nào?
                                    </div>
                                    <div className="store-support-choice-list">
                                        {[
                                            { value: "NAME", label: "Họ và tên" },
                                            { value: "PHONE", label: "Số điện thoại" },
                                            { value: "BOTH", label: "Cả hai" },
                                        ].map((option) => (
                                            <button
                                                key={option.value}
                                                type="button"
                                                className={`store-support-choice-button ${profileEditMode === option.value ? "active" : ""
                                                    }`}
                                                onClick={() => {
                                                    setProfileEditMode(option.value);
                                                    setProfileForm((current) => ({
                                                        requestedFullName:
                                                            option.value === "PHONE"
                                                                ? ""
                                                                : current.requestedFullName,
                                                        requestedPhone:
                                                            option.value === "NAME"
                                                                ? ""
                                                                : current.requestedPhone,
                                                    }));
                                                }}
                                                disabled={profileSubmitting}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {(profileEditMode === "NAME" ||
                                    profileEditMode === "BOTH") && (
                                        <label>
                                            <span>Họ và tên mới</span>
                                            <input
                                                type="text"
                                                value={profileForm.requestedFullName}
                                                onChange={(event) =>
                                                    setProfileForm((current) => ({
                                                        ...current,
                                                        requestedFullName: event.target.value,
                                                    }))
                                                }
                                                placeholder="Nhập họ tên muốn cập nhật"
                                                disabled={profileSubmitting}
                                            />
                                        </label>
                                    )}

                                {(profileEditMode === "PHONE" ||
                                    profileEditMode === "BOTH") && (
                                        <label>
                                            <span>Số điện thoại mới</span>
                                            <input
                                                type="tel"
                                                value={profileForm.requestedPhone}
                                                onChange={(event) =>
                                                    setProfileForm((current) => ({
                                                        ...current,
                                                        requestedPhone: event.target.value,
                                                    }))
                                                }
                                                placeholder="Nhập số điện thoại muốn cập nhật"
                                                disabled={profileSubmitting}
                                            />
                                        </label>
                                    )}


                                <p className="store-support-field-hint">
                                    Bạn cần nhập ít nhất một trong hai thông tin.
                                </p>

                                <button
                                    className="store-support-submit"
                                    type="submit"
                                    disabled={
                                        profileSubmitting ||
                                        (!profileForm.requestedFullName.trim() &&
                                            !profileForm.requestedPhone.trim())
                                    }
                                >
                                    {profileSubmitting
                                        ? "ĐANG GỬI..."
                                        : "GỬI YÊU CẦU CẬP NHẬT"}
                                </button>
                            </form>

                            <div className="store-support-history">
                                <div className="store-support-history-heading">
                                    <h4>Lịch sử yêu cầu hồ sơ</h4>
                                    <button
                                        type="button"
                                        onClick={loadProfileRequests}
                                        disabled={profileLoading}
                                    >
                                        Làm mới
                                    </button>
                                </div>

                                {profileLoading && profileRequests.length === 0 ? (
                                    <p className="store-support-muted">Đang tải lịch sử...</p>
                                ) : profileRequests.length === 0 ? (
                                    <p className="store-support-muted">
                                        Bạn chưa có yêu cầu cập nhật nào.
                                    </p>
                                ) : (
                                    <div className="store-support-request-list">
                                        {profileRequests.map((request) => {
                                            const status = request.status;

                                            return (
                                                <article className="store-support-request" key={request.id}>
                                                    <div className="store-support-request-top">
                                                        <strong>{getRequestIdLabel(request)}</strong>
                                                        <span className={`store-support-status status-${String(status || "").toLowerCase()}`}>
                                                            {getRequestStatusLabel(status)}
                                                        </span>
                                                    </div>

                                                    {request.requestedFullName && (
                                                        <p>Họ tên: {request.requestedFullName}</p>
                                                    )}

                                                    {request.requestedPhone && (
                                                        <p>Số điện thoại: {request.requestedPhone}</p>
                                                    )}

                                                    <small>
                                                        {formatSupportDate(
                                                            request.createdAt || request.requestedAt
                                                        )}
                                                    </small>

                                                    {request.adminNote && (
                                                        <p className="store-support-request-reason">
                                                            Phản hồi: {request.adminNote}
                                                        </p>
                                                    )}
                                                </article>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </section>
            )}
        </>
    );
}
