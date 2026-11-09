
const crypto = require("crypto");
const querystring = require("querystring");

// ==========================================
// VNPAY CONSTANTS
// ==========================================

const VNPAY_VERSION = "2.1.0";
const VNPAY_COMMAND = "pay";
const VNPAY_CURRENCY = "VND";
const VNPAY_LOCALE = "vn";

const VNPAY_SANDBOX_URL =
    "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";

// ==========================================
// PARAMETER HELPERS
// ==========================================

function sortObject(params) {
    const sorted = {};

    Object.keys(params)
        .sort()
        .forEach((key) => {
            const value = params[key];

            if (
                value === undefined ||
                value === null ||
                key === "vnp_SecureHash" ||
                key === "vnp_SecureHashType"
            ) {
                return;
            }

            if (
                typeof value !== "string" &&
                typeof value !== "number"
            ) {
                throw new TypeError(
                    `Invalid VNPAY parameter: ${key}`
                );
            }

            sorted[key] = String(value);
        });

    return sorted;
}

function encodeVnpayParams(params) {
    const sorted = sortObject(params);

    return querystring.stringify(
        sorted,
        "&",
        "=",
        {
            encodeURIComponent: (value) =>
                encodeURIComponent(value).replace(/%20/g, "+"),
        }
    );
}

// ==========================================
// SIGNATURE
// ==========================================

function createSecureHash(params, hashSecret) {
    if (
        typeof hashSecret !== "string" ||
        !hashSecret.trim()
    ) {
        throw new Error("VNPAY_HASH_SECRET_REQUIRED");
    }

    const signData = encodeVnpayParams(params);

    return crypto
        .createHmac("sha512", hashSecret)
        .update(signData, "utf8")
        .digest("hex");
}

function verifySecureHash(params, hashSecret) {
    if (!params || typeof params !== "object") {
        return false;
    }

    const receivedHash = params.vnp_SecureHash;

    if (
        typeof receivedHash !== "string" ||
        !/^[a-fA-F0-9]{128}$/.test(receivedHash)
    ) {
        return false;
    }

    try {
        const expectedHash = createSecureHash(
            params,
            hashSecret
        );

        const receivedBuffer = Buffer.from(
            receivedHash.toLowerCase(),
            "hex"
        );

        const expectedBuffer = Buffer.from(
            expectedHash,
            "hex"
        );

        if (receivedBuffer.length !== expectedBuffer.length) {
            return false;
        }

        return crypto.timingSafeEqual(
            receivedBuffer,
            expectedBuffer
        );
    } catch {
        return false;
    }
}

// ==========================================
// DATE HELPERS
// ==========================================

function formatVnpayDate(date = new Date()) {
    if (
        !(date instanceof Date) ||
        Number.isNaN(date.getTime())
    ) {
        throw new TypeError("INVALID_VNPAY_DATE");
    }

    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    }).formatToParts(date);

    const values = {};

    for (const part of parts) {
        if (part.type !== "literal") {
            values[part.type] = part.value;
        }
    }

    return (
        values.year +
        values.month +
        values.day +
        values.hour +
        values.minute +
        values.second
    );
}

// ==========================================
// PAYMENT URL
// ==========================================

function createPaymentUrl({
    params,
    hashSecret,
    paymentUrl = VNPAY_SANDBOX_URL,
}) {
    if (
        typeof paymentUrl !== "string" ||
        !paymentUrl.startsWith("https://")
    ) {
        throw new Error("INVALID_VNPAY_PAYMENT_URL");
    }

    const sortedParams = sortObject(params);

    const secureHash = createSecureHash(
        sortedParams,
        hashSecret
    );

    const query = encodeVnpayParams(sortedParams);

    return `${paymentUrl}?${query}&vnp_SecureHash=${secureHash}`;
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
    VNPAY_VERSION,
    VNPAY_COMMAND,
    VNPAY_CURRENCY,
    VNPAY_LOCALE,
    VNPAY_SANDBOX_URL,

    sortObject,
    encodeVnpayParams,
    createSecureHash,
    verifySecureHash,
    formatVnpayDate,
    createPaymentUrl,
};
