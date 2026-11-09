const {
    VNPAY_VERSION,
    VNPAY_COMMAND,
    VNPAY_CURRENCY,
    VNPAY_LOCALE,
    VNPAY_SANDBOX_URL,
    formatVnpayDate,
    createPaymentUrl,
} = require("./vnpay.utils");

const { getRequiredEnv } = require("../../../../core/config/env");

function toVnpayAmount(amount) {
    let amountString;

    if (
        amount &&
        typeof amount === "object" &&
        typeof amount.toFixed === "function"
    ) {
        amountString = amount.toFixed(2);
    } else {
        amountString = String(amount);
    }

    if (!/^\d+(?:\.\d{1,2})?$/.test(amountString)) {
        throw new Error("INVALID_PAYMENT_AMOUNT");
    }

    const [whole, fraction = ""] = amountString.split(".");
    const minorUnits =
        BigInt(whole) * 100n +
        BigInt((fraction + "00").slice(0, 2));

    if (minorUnits <= 0n) {
        throw new Error("INVALID_PAYMENT_AMOUNT");
    }

    return minorUnits.toString();
}

function getVnpayConfig() {
    return {
        tmnCode: getRequiredEnv("VNPAY_TMN_CODE"),
        hashSecret: getRequiredEnv("VNPAY_HASH_SECRET"),
        paymentUrl:
            process.env.VNPAY_PAYMENT_URL || VNPAY_SANDBOX_URL,
        returnUrl: getRequiredEnv("VNPAY_RETURN_URL"),
    };
}

function buildVnpayParams({
    payment,
    order,
    ipAddr,
    now = new Date(),
}) {
    if (!payment || !order) {
        throw new Error("PAYMENT_OR_ORDER_REQUIRED");
    }

    if (!payment.amount || !payment.expiresAt) {
        throw new Error("INVALID_PAYMENT_DATA");
    }

    if (!order.orderNumber) {
        throw new Error("INVALID_ORDER_NUMBER");
    }

    if (
        typeof ipAddr !== "string" ||
        !ipAddr.trim()
    ) {
        throw new Error("INVALID_CUSTOMER_IP");
    }

    if (!(payment.expiresAt instanceof Date) ||
        Number.isNaN(payment.expiresAt.getTime())) {
        throw new Error("INVALID_PAYMENT_EXPIRY");
    }

    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
        throw new Error("INVALID_CURRENT_DATE");
    }

    if (payment.expiresAt <= now) {
        throw new Error("PAYMENT_SESSION_EXPIRED");
    }

    const txnRef = order.orderNumber.replace(/[^a-zA-Z0-9]/g, "");

    if (!txnRef || txnRef.length > 100) {
        throw new Error("INVALID_VNPAY_TXN_REF");
    }

    const config = getVnpayConfig();

    return {
        vnp_Version: VNPAY_VERSION,
        vnp_Command: VNPAY_COMMAND,
        vnp_TmnCode: config.tmnCode,
        vnp_Amount: toVnpayAmount(payment.amount),
        vnp_CurrCode: VNPAY_CURRENCY,
        vnp_TxnRef: txnRef,
        vnp_OrderInfo: `Thanh toan don hang ${order.orderNumber}`,
        vnp_OrderType: "other",
        vnp_Locale: VNPAY_LOCALE,
        vnp_ReturnUrl: config.returnUrl,
        vnp_IpAddr: ipAddr.trim(),
        vnp_CreateDate: formatVnpayDate(now),
        vnp_ExpireDate: formatVnpayDate(payment.expiresAt),
    };
}

function createVnpayPaymentUrl({
    payment,
    order,
    ipAddr,
    now = new Date(),
}) {
    const config = getVnpayConfig();

    const params = buildVnpayParams({
        payment,
        order,
        ipAddr,
        now,
    });

    const paymentUrl = createPaymentUrl({
        params,
        hashSecret: config.hashSecret,
        paymentUrl: config.paymentUrl,
    });

    return {
        paymentUrl,
        txnRef: params.vnp_TxnRef,
        params,
    };
}

module.exports = {
    toVnpayAmount,
    getVnpayConfig,
    buildVnpayParams,
    createVnpayPaymentUrl,
};