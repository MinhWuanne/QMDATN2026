const prisma = require("../../core/database/prisma");
const crypto = require("crypto");

const {
    createVnpayPaymentUrl,
    getVnpayConfig,
    toVnpayAmount,
} = require("./providers/vnpay/vnpay.service");

const {
    verifySecureHash,
} = require("./providers/vnpay/vnpay.utils");

const VNPAY_PROVIDER = "VNPAY";

function throwPaymentError(message, statusCode = 409) {
    const error = new Error(message);
    error.statusCode = statusCode;
    throw error;
}

function isPrismaError(error, code) {
    return error && error.code === code;
}

function getCreatePaymentKey(paymentId) {
    return `VNPAY-CREATE-${paymentId}`;
}

function getStoredPaymentUrl(transaction, payment, order) {
    const requestData = transaction.requestData;
    const responseData = transaction.responseData;

    if (
        !requestData ||
        !responseData ||
        typeof responseData.paymentUrl !== "string" ||
        !responseData.paymentUrl.startsWith("https://")
    ) {
        throwPaymentError("VNPAY_PAYMENT_URL_NOT_FOUND", 500);
    }

    const expectedTxnRef = order.orderNumber.replace(
        /[^a-zA-Z0-9]/g,
        ""
    );

    if (
        requestData.orderId !== order.id ||
        requestData.paymentId !== payment.id ||
        requestData.orderNumber !== order.orderNumber ||
        requestData.txnRef !== expectedTxnRef ||
        requestData.amount !== payment.amount.toFixed(2) ||
        requestData.expiresAt !== payment.expiresAt.toISOString()
    ) {
        throwPaymentError("VNPAY_PAYMENT_DATA_MISMATCH", 409);
    }

    return {
        paymentUrl: responseData.paymentUrl,
        txnRef: requestData.txnRef,
        reused: true,
    };
}

async function findExistingCreateTransaction(paymentId) {
    return prisma.paymentTransaction.findUnique({
        where: {
            idempotencyKey: getCreatePaymentKey(paymentId),
        },
    });
}

async function createOrGetVnpayPaymentUrl({
    orderId,
    userId,
    ipAddr,
}) {
    if (!orderId || !userId) {
        throwPaymentError("ORDER_AND_USER_REQUIRED", 400);
    }

    if (typeof ipAddr !== "string" || !ipAddr.trim()) {
        throwPaymentError("INVALID_CUSTOMER_IP", 400);
    }

    const payment = await prisma.payment.findFirst({
        where: {
            order: {
                is: {
                    id: orderId,
                    userId,
                },
            },
        },
        include: {
            order: true,
        },
    });

    if (!payment || !payment.order) {
        throwPaymentError("ORDER_NOT_FOUND", 404);
    }

    const order = payment.order;

    if (
        order.paymentMethod !== "VNPAY" ||
        payment.method !== "VNPAY"
    ) {
        throwPaymentError("PAYMENT_METHOD_MISMATCH", 409);
    }

    if (order.status !== "PENDING_CONFIRMATION") {
        throwPaymentError("ORDER_NOT_AVAILABLE_FOR_CHECKOUT", 409);
    }

    if (payment.status !== "PENDING") {
        throwPaymentError("PAYMENT_NOT_PENDING", 409);
    }

    if (!payment.checkoutStartedAt || !payment.expiresAt) {
        throwPaymentError("CHECKOUT_SESSION_NOT_STARTED", 409);
    }

    const now = new Date();

    if (payment.expiresAt <= now) {
        throwPaymentError("PAYMENT_SESSION_EXPIRED", 409);
    }

    if (
        payment.amount.toFixed(2) !==
        order.totalAmount.toFixed(2)
    ) {
        throwPaymentError("PAYMENT_AMOUNT_MISMATCH", 409);
    }

    const idempotencyKey = getCreatePaymentKey(payment.id);

    // Nếu URL đã được tạo trước đó, dùng lại URL cũ.
    const existingTransaction =
        await findExistingCreateTransaction(payment.id);

    if (existingTransaction) {
        return getStoredPaymentUrl(
            existingTransaction,
            payment,
            order
        );
    }

    // Tạo URL từ đúng Payment và Order hiện tại.
    const generated = createVnpayPaymentUrl({
        payment,
        order,
        ipAddr: ipAddr.trim(),
        now,
    });

    const requestData = {
        orderId: order.id,
        paymentId: payment.id,
        orderNumber: order.orderNumber,
        txnRef: generated.txnRef,
        amount: payment.amount.toFixed(2),
        vnpAmount: generated.params.vnp_Amount,
        expiresAt: payment.expiresAt.toISOString(),
        params: generated.params,
    };

    const responseData = {
        paymentUrl: generated.paymentUrl,
        txnRef: generated.txnRef,
    };

    try {
        await prisma.$transaction(
            async (tx) => {
                // Kiểm tra lại trạng thái trước khi ghi giao dịch.
                const currentPayment = await tx.payment.findUnique({
                    where: {
                        id: payment.id,
                    },
                    include: {
                        order: true,
                    },
                });

                if (
                    !currentPayment ||
                    currentPayment.status !== "PENDING" ||
                    currentPayment.method !== "VNPAY" ||
                    currentPayment.order.status !== "PENDING_CONFIRMATION" ||
                    currentPayment.expiresAt <= new Date()
                ) {
                    throwPaymentError(
                        "PAYMENT_SESSION_NO_LONGER_AVAILABLE",
                        409
                    );
                }

                if (
                    currentPayment.amount.toFixed(2) !==
                    currentPayment.order.totalAmount.toFixed(2)
                ) {
                    throwPaymentError(
                        "PAYMENT_AMOUNT_MISMATCH",
                        409
                    );
                }

                await tx.paymentTransaction.create({
                    data: {
                        paymentId: payment.id,
                        type: "CREATE_PAYMENT",
                        requestData,
                        responseData,
                        idempotencyKey,
                        isSuccessful: true,
                    },
                });

                await tx.payment.update({
                    where: {
                        id: payment.id,
                    },
                    data: {
                        provider: VNPAY_PROVIDER,
                    },
                });
            },
            {
                isolationLevel: "Serializable",
            }
        );

        return {
            paymentUrl: generated.paymentUrl,
            txnRef: generated.txnRef,
            reused: false,
        };
    } catch (error) {
        // Request đồng thời có thể đã tạo transaction trước.
        if (isPrismaError(error, "P2002")) {
            const transaction =
                await findExistingCreateTransaction(payment.id);

            if (transaction) {
                return getStoredPaymentUrl(
                    transaction,
                    payment,
                    order
                );
            }
        }

        throw error;
    }
}

function getIpnIdempotencyKey(paymentId, txnNo, responseCode, transactionStatus) {
    const raw = [
        paymentId,
        txnNo,
        responseCode,
        transactionStatus,
    ].join("|");

    const hash = crypto
        .createHash("sha256")
        .update(raw)
        .digest("hex");

    return `VNPAY-IPN-${hash}`;
}

function parseVnpayPayDate(value) {
    if (
        typeof value !== "string" ||
        !/^\d{14}$/.test(value)
    ) {
        return null;
    }

    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6));
    const day = Number(value.slice(6, 8));
    const hour = Number(value.slice(8, 10));
    const minute = Number(value.slice(10, 12));
    const second = Number(value.slice(12, 14));

    const utc = Date.UTC(
        year,
        month - 1,
        day,
        hour,
        minute,
        second
    );

    const check = new Date(utc);

    if (
        check.getUTCFullYear() !== year ||
        check.getUTCMonth() !== month - 1 ||
        check.getUTCDate() !== day ||
        hour > 23 ||
        minute > 59 ||
        second > 59
    ) {
        return null;
    }

    // VNPAY PayDate sử dụng múi giờ GMT+7.
    return new Date(utc - 7 * 60 * 60 * 1000);
}

function isValidIpnParams(params) {
    if (!params || typeof params !== "object") {
        return false;
    }

    return Object.values(params).every(
        (value) =>
            typeof value === "string" ||
            typeof value === "number"
    );
}

async function findVnpayCreateTransaction(txnRef) {
    return prisma.paymentTransaction.findFirst({
        where: {
            type: "CREATE_PAYMENT",
            requestData: {
                path: ["txnRef"],
                equals: txnRef,
            },
        },
        include: {
            payment: {
                include: {
                    order: true,
                },
            },
        },
    });
}

async function processVnpayIpn(params) {
    // 1. Kiểm tra cấu trúc dữ liệu.
    if (!isValidIpnParams(params)) {
        return {
            RspCode: "99",
            Message: "Invalid parameters",
        };
    }

    // 2. Xác thực chữ ký trước khi truy vấn database.
    const config = getVnpayConfig();

    if (!verifySecureHash(params, config.hashSecret)) {
        return {
            RspCode: "97",
            Message: "Invalid signature",
        };
    }

    // 3. Kiểm tra các trường bắt buộc.
    const requiredFields = [
        "vnp_TmnCode",
        "vnp_TxnRef",
        "vnp_Amount",
        "vnp_TransactionNo",
        "vnp_ResponseCode",
        "vnp_TransactionStatus",
    ];

    if (
        requiredFields.some(
            (field) =>
                typeof params[field] !== "string" ||
                !params[field].length
        )
    ) {
        return {
            RspCode: "99",
            Message: "Missing required parameters",
        };
    }

    if (params.vnp_TmnCode !== config.tmnCode) {
        return {
            RspCode: "97",
            Message: "Invalid merchant",
        };
    }

    if (
        !/^\d{1,15}$/.test(params.vnp_TransactionNo) ||
        !/^\d+$/.test(params.vnp_Amount)
    ) {
        return {
            RspCode: "99",
            Message: "Invalid transaction data",
        };
    }

    // 4. Tìm giao dịch tạo URL tương ứng với TxnRef.
    const createTransaction =
        await findVnpayCreateTransaction(params.vnp_TxnRef);

    if (
        !createTransaction ||
        !createTransaction.payment ||
        !createTransaction.payment.order
    ) {
        return {
            RspCode: "01",
            Message: "Order not found",
        };
    }

    const payment = createTransaction.payment;
    const order = payment.order;
    const requestData = createTransaction.requestData;

    if (
        requestData.txnRef !== params.vnp_TxnRef ||
        requestData.paymentId !== payment.id ||
        requestData.orderId !== order.id
    ) {
        return {
            RspCode: "01",
            Message: "Transaction reference mismatch",
        };
    }

    // 5. Đối chiếu số tiền với Payment trong database.
    const expectedAmount = toVnpayAmount(payment.amount);

    if (
        params.vnp_Amount !== expectedAmount ||
        params.vnp_Amount !== requestData.vnpAmount
    ) {
        return {
            RspCode: "04",
            Message: "Invalid amount",
        };
    }

    // 6. Đối chiếu thông tin merchant và nội dung đơn hàng.
    const storedParams = requestData.params || {};

    if (
        storedParams.vnp_TmnCode !== params.vnp_TmnCode ||
        storedParams.vnp_OrderInfo !== params.vnp_OrderInfo
    ) {
        return {
            RspCode: "04",
            Message: "Transaction data mismatch",
        };
    }

    const transactionNo = params.vnp_TransactionNo;
    const responseCode = params.vnp_ResponseCode;
    const transactionStatus = params.vnp_TransactionStatus;

    const idempotencyKey = getIpnIdempotencyKey(
        payment.id,
        transactionNo,
        responseCode,
        transactionStatus
    );

    const successful =
        responseCode === "00" &&
        transactionStatus === "00";

    const payDate = params.vnp_PayDate
        ? parseVnpayPayDate(params.vnp_PayDate)
        : null;

    if (successful && params.vnp_PayDate && !payDate) {
        return {
            RspCode: "99",
            Message: "Invalid payment date",
        };
    }

    try {
        const result = await prisma.$transaction(
            async (tx) => {
                // Kiểm tra callback đã được xử lý chưa.
                const existingIpn =
                    await tx.paymentTransaction.findUnique({
                        where: {
                            idempotencyKey,
                        },
                    });

                if (existingIpn) {
                    const existingResponse = existingIpn.responseData || {};

                    const isSameCallback =
                        existingIpn.paymentId === payment.id &&
                        existingIpn.type === "IPN" &&
                        existingIpn.providerTxnId === transactionNo &&
                        existingResponse.responseCode === responseCode &&
                        existingResponse.transactionStatus === transactionStatus &&
                        existingResponse.successful === successful;

                    if (!isSameCallback) {
                        return {
                            RspCode: "99",
                            Message: "Idempotency data mismatch",
                        };
                    }

                    return {
                        RspCode: "00",
                        Message: "Confirm Success",
                    };
                }

                // Đọc lại Payment và Order trong transaction.
                const currentPayment =
                    await tx.payment.findUnique({
                        where: {
                            id: payment.id,
                        },
                        include: {
                            order: true,
                        },
                    });

                if (!currentPayment || !currentPayment.order) {
                    return {
                        RspCode: "01",
                        Message: "Order not found",
                    };
                }

                const samePaymentTxn =
                    await tx.paymentTransaction.findFirst({
                        where: {
                            providerTxnId: transactionNo,
                            paymentId: payment.id,
                            type: "IPN",
                        },
                    });

                if (samePaymentTxn) {
                    return {
                        RspCode: "04",
                        Message: "Transaction already processed with different callback data",
                    };
                }

                // Không cho phép một giao dịch VNPAY
                // được gắn vào nhiều Payment khác nhau.
                const transactionUsed =
                    await tx.paymentTransaction.findFirst({
                        where: {
                            providerTxnId: transactionNo,
                            paymentId: {
                                not: payment.id,
                            },
                        },
                    });

                const paymentTxnUsed =
                    await tx.payment.findFirst({
                        where: {
                            providerTxnId: transactionNo,
                            id: {
                                not: payment.id,
                            },
                        },
                    });

                if (transactionUsed || paymentTxnUsed) {
                    return {
                        RspCode: "04",
                        Message: "Transaction already used",
                    };
                }

                // Callback thất bại: ghi log nhưng giữ Payment PENDING.
                if (!successful) {
                    await tx.paymentTransaction.create({
                        data: {
                            paymentId: payment.id,
                            type: "IPN",
                            requestData: params,
                            responseData: {
                                responseCode,
                                transactionStatus,
                                successful: false,
                            },
                            providerTxnId: transactionNo,
                            idempotencyKey,
                            isSuccessful: false,
                            errorMessage: `VNPAY_RESPONSE_${responseCode}_STATUS_${transactionStatus}`,
                        },
                    });

                    return {
                        RspCode: "00",
                        Message: "Confirm Success",
                    };
                }

                // Payment đã PAID bởi giao dịch trước đó.
                if (currentPayment.status === "PAID") {
                    if (currentPayment.providerTxnId === transactionNo) {
                        return {
                            RspCode: "00",
                            Message: "Confirm Success",
                        };
                    }

                    return {
                        RspCode: "02",
                        Message: "Payment already confirmed",
                    };
                }

                // Chỉ PENDING hoặc CANCELLED được chuyển sang PAID.
                if (!["PENDING", "CANCELLED"].includes(currentPayment.status)) {
                    return {
                        RspCode: "02",
                        Message: "Payment cannot be updated",
                    };
                }

                // Chỉ ghi log thành công sau khi đã xác nhận trạng thái hợp lệ.
                await tx.paymentTransaction.create({
                    data: {
                        paymentId: payment.id,
                        type: "IPN",
                        requestData: params,
                        responseData: {
                            responseCode,
                            transactionStatus,
                            successful: true,
                        },
                        providerTxnId: transactionNo,
                        idempotencyKey,
                        isSuccessful: true,
                        errorMessage: null,
                    },
                });
                const paymentUpdate = await tx.payment.updateMany({
                    where: {
                        id: payment.id,
                        status: currentPayment.status,
                    },
                    data: {
                        status: "PAID",
                        provider: VNPAY_PROVIDER,
                        providerTxnId: transactionNo,
                        paidAt: payDate || new Date(),
                        failedAt: null,
                    },
                });

                if (paymentUpdate.count !== 1) {
                    throwPaymentError(
                        "VNPAY_PAYMENT_STATE_CHANGED_RETRY",
                        503
                    );
                }

                // CỐ Ý KHÔNG cập nhật Order.status.
                // Admin sẽ xác nhận đơn qua luồng quản lý đơn hàng.
                // Nếu Order đã CANCELLED thì giữ nguyên CANCELLED.

                return {
                    RspCode: "00",
                    Message: "Confirm Success",
                };
            },
            {
                isolationLevel: "Serializable",
            }
        );

        return result;
    } catch (error) {
        if (isPrismaError(error, "P2002")) {
            const existingIpn =
                await prisma.paymentTransaction.findUnique({
                    where: {
                        idempotencyKey,
                    },
                });

            if (existingIpn) {
                const existingResponse =
                    existingIpn.responseData || {};

                const isSameCallback =
                    existingIpn.paymentId === payment.id &&
                    existingIpn.type === "IPN" &&
                    existingIpn.providerTxnId === transactionNo &&
                    existingResponse.responseCode === responseCode &&
                    existingResponse.transactionStatus === transactionStatus &&
                    existingResponse.successful === successful;

                if (isSameCallback) {
                    return {
                        RspCode: "00",
                        Message: "Confirm Success",
                    };
                }

                return {
                    RspCode: "99",
                    Message: "Idempotency data mismatch",
                };
            }
        }

        throw error;
    }
}

module.exports = {
    createOrGetVnpayPaymentUrl,
    processVnpayIpn,
};