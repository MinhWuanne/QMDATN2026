
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

    const [exchangeVariants, setExchangeVariants] = useState([]);
    const [exchangeVariantsLoading, setExchangeVariantsLoading] = useState(false);
    const [exchangeVariantsError, setExchangeVariantsError] = useState("");

    const [returnForm, setReturnForm] = useState({
        orderId: "",
        orderItemId: "",
        quantity: 1,
        resolution: "REFUND",
        exchangeVariantId: "",
        reason: "",
        customerNote: "",
    });

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

        const selectedOrder = memberOrders.find(
            (order) => order.id === returnForm.orderId
        );

        const selectedItem = selectedOrder?.items?.find(
            (item) => item.id === returnForm.orderItemId
        );

        if (
            returnForm.resolution !== "EXCHANGE" ||
            !selectedItem?.productId
        ) {
            setExchangeVariants([]);
            setExchangeVariantsError("");
            setExchangeVariantsLoading(false);

            return () => {
                cancelled = true;
            };
        }

        async function loadExchangeVariants() {
            setExchangeVariantsLoading(true);
            setExchangeVariantsError("");
            setExchangeVariants([]);

            try {
                const productResult = await getCustomerCatalogProduct(
                    selectedItem.productId
                );

                if (cancelled) return;

                const variants = Array.isArray(productResult?.data?.variants)
                    ? productResult.data.variants
                    : [];

                setExchangeVariants(
                    variants.filter(
                        (variant) => variant.id !== selectedItem.variantId
                    )
                );
            } catch (error) {
                if (!cancelled) {
                    setExchangeVariantsError(
                        error.message || "Không thể tải các phiên bản có thể đổi."
                    );
                }
            } finally {
                if (!cancelled) {
                    setExchangeVariantsLoading(false);
                }
            }
        }

        loadExchangeVariants();

        return () => {
            cancelled = true;
        };
    }, [
        memberOrders,
        returnForm.orderId,
        returnForm.orderItemId,
        returnForm.resolution,
    ]);

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
        (order) => order.id === returnForm.orderId
    );

    const selectedReturnItem = selectedReturnOrder?.items?.find(
        (item) => item.id === returnForm.orderItemId
    );

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

        if (!returnForm.orderId || !returnForm.orderItemId) {
            setReturnError("Vui lòng chọn đơn hàng và sản phẩm cần đổi/trả.");
            return;
        }

        if (
            !Number.isSafeInteger(Number(returnForm.quantity)) ||
            Number(returnForm.quantity) < 1
        ) {
            setReturnError("Số lượng yêu cầu không hợp lệ.");
            return;
        }

        if (returnForm.reason.trim().length < 3) {
            setReturnError("Lý do cần có ít nhất 3 ký tự.");
            return;
        }

        if (
            returnForm.resolution === "EXCHANGE" &&
            !returnForm.exchangeVariantId
        ) {
            setReturnError("Vui lòng chọn phiên bản muốn đổi.");
            return;
        }

        setReturnSubmitting(true);
        setReturnError("");
        setReturnNotice("");

        try {
            await createMemberReturnRequest({
                orderId: returnForm.orderId,
                orderItemId: returnForm.orderItemId,
                quantity: Number(returnForm.quantity),
                resolution: returnForm.resolution,
                reason: returnForm.reason.trim(),
                customerNote: returnForm.customerNote.trim() || undefined,
                exchangeVariantId:
                    returnForm.resolution === "EXCHANGE"
                        ? returnForm.exchangeVariantId
                        : undefined,
                accessToken: chatTokenRef.current,
                onSessionRefresh: refreshChatSession,
                onSessionExpired,
            });

            setReturnNotice(
                returnForm.resolution === "EXCHANGE"
                    ? "Đã gửi yêu cầu đổi phiên bản. Bạn có thể theo dõi trạng thái bên dưới."
                    : "Đã gửi yêu cầu hoàn tiền. Bạn có thể theo dõi trạng thái bên dưới."
            );

            setReturnForm({
                orderId: "",
                orderItemId: "",
                quantity: 1,
                resolution: "REFUND",
                exchangeVariantId: "",
                reason: "",
                customerNote: "",
            });

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
            PENDING: "Đang chờ xử lý",
            APPROVED: "Đã chấp thuận",
            REJECTED: "Đã từ chối",
            PROCESSING: "Đang xử lý",
            COMPLETED: "Đã hoàn tất",
            REFUNDED: "Đã hoàn tiền",
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
                                        value={returnForm.orderId}
                                        onChange={(event) => {
                                            setReturnForm((current) => ({
                                                ...current,
                                                orderId: event.target.value,
                                                orderItemId: "",
                                                quantity: 1,
                                                exchangeVariantId: "",
                                            }));
                                            setReturnError("");
                                            setReturnNotice("");
                                        }}
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

                                <label>
                                    <span> Sản phẩm cần đổi / trả <b>*</b></span>
                                    <select
                                        value={returnForm.orderItemId}
                                        onChange={(event) => {
                                            setReturnForm((current) => ({
                                                ...current,
                                                orderItemId: event.target.value,
                                                quantity: 1,
                                                exchangeVariantId: "",
                                            }));
                                            setReturnError("");
                                        }}
                                        required
                                        disabled={!selectedReturnOrder || returnSubmitting}
                                    >
                                        <option value="">-- Chọn sản phẩm --</option>
                                        {(selectedReturnOrder?.items || []).map((item) => (
                                            <option key={item.id} value={item.id}>
                                                {getOrderItemLabel(item)} · SL: {item.quantity}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                {selectedReturnItem && (
                                    <div className="store-support-resolution">
                                        <span className="store-support-field-title">
                                            Bạn muốn thực hiện yêu cầu nào? <b>*</b>
                                        </span>

                                        <div className="store-support-resolution-options">
                                            <label className={returnForm.resolution === "REFUND" ? "active" : ""}>
                                                <input
                                                    type="radio"
                                                    name="returnResolution"
                                                    value="REFUND"
                                                    checked={returnForm.resolution === "REFUND"}
                                                    onChange={() => setReturnForm((current) => ({
                                                        ...current,
                                                        resolution: "REFUND",
                                                        exchangeVariantId: "",
                                                    }))}
                                                    disabled={returnSubmitting}
                                                />
                                                <span>
                                                    <strong>Hoàn tiền</strong>
                                                    <small>
                                                        Nhận lại tiền theo giá trị sản phẩm được duyệt
                                                    </small>
                                                </span>
                                            </label>

                                            <label className={returnForm.resolution === "EXCHANGE" ? "active" : ""}>
                                                <input
                                                    type="radio"
                                                    name="returnResolution"
                                                    value="EXCHANGE"
                                                    checked={returnForm.resolution === "EXCHANGE"}
                                                    onChange={() => setReturnForm((current) => ({
                                                        ...current,
                                                        resolution: "EXCHANGE",
                                                        exchangeVariantId: "",
                                                    }))}
                                                    disabled={returnSubmitting}
                                                />
                                                <span>
                                                    <strong>Đổi phiên bản</strong>
                                                    <small>
                                                        Đổi sang màu hoặc phiên bản khác của cùng sản phẩm
                                                    </small>
                                                </span>
                                            </label>
                                        </div>

                                        <div className="store-support-choice-group">
                                            <div className="store-support-choice-title">
                                                {returnForm.resolution === "EXCHANGE"
                                                    ? "Lý do bạn muốn đổi hàng?"
                                                    : "Lý do bạn muốn hoàn tiền?"}
                                            </div>

                                            <div className="store-support-choice-list">
                                                {[
                                                    "Sản phẩm bị lỗi hoặc hư hỏng",
                                                    "Nhận sai sản phẩm hoặc phiên bản",
                                                    "Sản phẩm không giống mô tả",
                                                    "Muốn đổi màu sắc hoặc phiên bản khác",
                                                    "Lý do khác",
                                                ].map((reason) => (
                                                    <button
                                                        key={reason}
                                                        type="button"
                                                        className={`store-support-choice-button ${returnForm.reason === reason ? "active" : ""
                                                            }`}
                                                        onClick={() =>
                                                            setReturnForm((current) => ({
                                                                ...current,
                                                                reason: reason === "Lý do khác" ? "" : reason,
                                                            }))
                                                        }
                                                        disabled={returnSubmitting}
                                                    >
                                                        {reason}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {selectedReturnItem && returnForm.resolution === "EXCHANGE" && (
                                    <div className="store-support-exchange">
                                        <label>
                                            <span>Phiên bản muốn đổi sang <b>*</b></span>
                                            <select
                                                value={returnForm.exchangeVariantId}
                                                onChange={(event) => setReturnForm((current) => ({
                                                    ...current,
                                                    exchangeVariantId: event.target.value,
                                                }))}
                                                required
                                                disabled={
                                                    exchangeVariantsLoading ||
                                                    returnSubmitting ||
                                                    exchangeVariants.length === 0
                                                }
                                            >
                                                <option value="">
                                                    {exchangeVariantsLoading
                                                        ? "Đang tải phiên bản..."
                                                        : "-- Chọn phiên bản muốn đổi --"}
                                                </option>
                                                {exchangeVariants.map((variant) => (
                                                    <option key={variant.id} value={variant.id}>
                                                        {variant.name}
                                                        {variant.inStock
                                                            ? " · Còn hàng"
                                                            : " · Hết hàng, chờ bổ sung"}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>

                                        {exchangeVariantsLoading && (
                                            <p className="store-support-muted">
                                                Đang tải các phiên bản của sản phẩm...
                                            </p>
                                        )}

                                        {exchangeVariantsError && (
                                            <div className="store-support-alert error" role="alert">
                                                {exchangeVariantsError}
                                            </div>
                                        )}

                                        {!exchangeVariantsLoading &&
                                            !exchangeVariantsError &&
                                            exchangeVariants.length === 0 && (
                                                <p className="store-support-hint">
                                                    Sản phẩm hiện không có phiên bản khác đang hoạt động để đổi.
                                                </p>
                                            )}

                                        {returnForm.exchangeVariantId && (
                                            <p className="store-support-hint">
                                                {exchangeVariants.find(
                                                    (variant) => variant.id === returnForm.exchangeVariantId
                                                )?.inStock
                                                    ? "Phiên bản bạn chọn hiện còn hàng. Cửa hàng sẽ kiểm tra và xác nhận khi tiếp nhận sản phẩm."
                                                    : "Phiên bản bạn chọn hiện đã hết hàng. Yêu cầu có thể phải chờ đến khi hàng được bổ sung."}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {selectedReturnItem && (
                                    <div className="store-support-selected-item">
                                        <span>Sản phẩm đã chọn</span>
                                        <strong>{getOrderItemLabel(selectedReturnItem)}</strong>
                                        <small>
                                            Số lượng trong đơn: {selectedReturnItem.quantity}
                                            {selectedReturnItem.unitPrice != null
                                                ? ` · Đơn giá: ${formatSupportMoney(selectedReturnItem.unitPrice)}`
                                                : ""}
                                        </small>
                                    </div>
                                )}

                                <label>
                                    <span>Số lượng cần đổi / trả <b>*</b></span>
                                    <input
                                        type="number"
                                        min="1"
                                        max={selectedReturnItem?.quantity || undefined}
                                        step="1"
                                        value={returnForm.quantity}
                                        onChange={(event) =>
                                            setReturnForm((current) => ({
                                                ...current,
                                                quantity: event.target.value,
                                            }))
                                        }
                                        required
                                        disabled={!selectedReturnItem || returnSubmitting}
                                    />
                                </label>

                                <label>
                                    <span>
                                        {returnForm.resolution === "EXCHANGE"
                                            ? "Lý do đổi hàng"
                                            : "Lý do hoàn tiền"}{" "}
                                        <b>*</b>
                                    </span>
                                    <textarea
                                        value={returnForm.reason}
                                        onChange={(event) =>
                                            setReturnForm((current) => ({
                                                ...current,
                                                reason: event.target.value,
                                            }))
                                        }
                                        minLength={3}
                                        maxLength={500}
                                        rows={3}
                                        placeholder={
                                            returnForm.resolution === "EXCHANGE"
                                                ? "Mô tả lý do bạn muốn đổi sang phiên bản khác..."
                                                : "Mô tả lý do bạn muốn hoàn tiền..."
                                        }
                                        required
                                        disabled={returnSubmitting}
                                    />
                                    <small className="store-support-field-hint">
                                        {returnForm.reason.length}/500 ký tự
                                    </small>
                                </label>

                                <label>
                                    <span>Ghi chú thêm</span>
                                    <textarea
                                        value={returnForm.customerNote}
                                        onChange={(event) =>
                                            setReturnForm((current) => ({
                                                ...current,
                                                customerNote: event.target.value,
                                            }))
                                        }
                                        maxLength={2000}
                                        rows={2}
                                        placeholder="Thông tin bổ sung (không bắt buộc)..."
                                        disabled={returnSubmitting}
                                    />
                                </label>

                                <button
                                    className="store-support-submit"
                                    type="submit"
                                    disabled={
                                        returnSubmitting ||
                                        returnLoading ||
                                        !selectedReturnItem ||
                                        !returnForm.reason.trim() ||
                                        (returnForm.resolution === "EXCHANGE" &&
                                            (
                                                !returnForm.exchangeVariantId ||
                                                exchangeVariantsLoading ||
                                                !!exchangeVariantsError ||
                                                !exchangeVariants.some(
                                                    (variant) => variant.id === returnForm.exchangeVariantId
                                                )
                                            ))
                                    }
                                >
                                    {returnSubmitting
                                        ? "ĐANG GỬI..."
                                        : returnForm.resolution === "EXCHANGE"
                                            ? "GỬI YÊU CẦU ĐỔI HÀNG"
                                            : "GỬI YÊU CẦU HOÀN TIỀN"}
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
