const API_BASE_URL = (
    import.meta.env.VITE_API_URL || "http://localhost:3000"
).replace(/\/+$/, "");

async function parseResponse(response) {
    const result = await response.json().catch(() => ({}));

    if (!response.ok || result.success === false) {
        const error = new Error(
            result.message || "Không thể thực hiện yêu cầu đổi/trả."
        );

        error.status = response.status;
        error.code = result.code || result.message;

        const detail = Array.isArray(result.details)
            ? result.details[0]?.message
            : null;

        if (detail) error.message = detail;
        throw error;
    }

    return result.data ?? result;
}

async function returnRequest(
    path,
    options,
    accessToken,
    onSessionRefresh,
    onSessionExpired
) {
    const request = async (token) => {
        const response = await fetch(
            `${API_BASE_URL}/api/returns${path}`,
            {
                ...options,
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    ...options.headers,
                    Authorization: `Bearer ${token}`,
                },
            }
        );

        return parseResponse(response);
    };

    try {
        return await request(accessToken);
    } catch (error) {
        if (error.status !== 401) throw error;

        try {
            if (!onSessionRefresh) {
                throw new Error("Không thể làm mới phiên đăng nhập.");
            }

            const session = await onSessionRefresh();

            if (!session?.accessToken) {
                throw new Error("Không thể làm mới phiên đăng nhập.");
            }

            return await request(session.accessToken);
        } catch (refreshError) {
            onSessionExpired?.();
            throw refreshError;
        }
    }
}

// Tạo nhiều ReturnRequest độc lập trong một lần gửi.
export function createMemberReturnRequest({
    orderId,
    items,
    accessToken,
    onSessionRefresh,
    onSessionExpired,
}) {
    if (!orderId) {
        throw new Error("Thiếu đơn hàng cần đổi/trả.");
    }

    if (!Array.isArray(items) || items.length === 0) {
        throw new Error("Vui lòng chọn ít nhất một sản phẩm.");
    }

    const body = {
        orderId,
        items: items.map((item) => {
            const requestItem = {
                orderItemId: item.orderItemId,
                quantity: Number(item.quantity),
                resolution: item.resolution,
                reason: item.reason?.trim(),
            };

            if (item.customerNote?.trim()) {
                requestItem.customerNote = item.customerNote.trim();
            }

            if (
                item.resolution === "EXCHANGE" &&
                item.exchangeVariantId
            ) {
                requestItem.exchangeVariantId = item.exchangeVariantId;
            }

            return requestItem;
        }),
    };

    return returnRequest(
        "",
        {
            method: "POST",
            body: JSON.stringify(body),
        },
        accessToken,
        onSessionRefresh,
        onSessionExpired
    );
}

export function getMemberReturnRequests({
    accessToken,
    onSessionRefresh,
    onSessionExpired,
    page = 1,
    limit = 20,
}) {
    const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
    });

    return returnRequest(
        `?${params.toString()}`,
        { method: "GET" },
        accessToken,
        onSessionRefresh,
        onSessionExpired
    );
}

export function getMemberReturnRequestDetail({
    returnRequestId,
    accessToken,
    onSessionRefresh,
    onSessionExpired,
}) {
    if (!returnRequestId) {
        throw new Error("Thiếu mã yêu cầu đổi/trả.");
    }

    return returnRequest(
        `/${encodeURIComponent(returnRequestId)}`,
        { method: "GET" },
        accessToken,
        onSessionRefresh,
        onSessionExpired
    );
}

export function getMemberEligibleReturnOrders({
    accessToken,
    onSessionRefresh,
    onSessionExpired,
}) {
    return returnRequest(
        "/eligible-orders",
        { method: "GET" },
        accessToken,
        onSessionRefresh,
        onSessionExpired
    );
}
