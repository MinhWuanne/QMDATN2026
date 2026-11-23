const crypto = require("crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../../core/database/prisma");
const {
    allocateVoucherDiscount,
} = require("./order-discount-allocation");

// ==========================================
// CONSTANTS
// ==========================================

const SHIPPING_FEE = new Prisma.Decimal(0);

const ORDER_STATUSES = [
    "PENDING_CONFIRMATION",
    "CONFIRMED",
    "PROCESSING",
    "SHIPPING",
    "DELIVERED",
    "COMPLETED",
    "CANCELLED",
];

const ALLOWED_TRANSITIONS = {
    PENDING_CONFIRMATION: ["CONFIRMED"],
    CONFIRMED: ["PROCESSING"],
    PROCESSING: ["SHIPPING"],
    SHIPPING: ["DELIVERED"],
    DELIVERED: ["COMPLETED"],
    COMPLETED: [],
    CANCELLED: [],
};

const ADMIN_CANCELLABLE_STATUSES = [
    "PENDING_CONFIRMATION",
    "CONFIRMED",
    "PROCESSING",
    "SHIPPING",
];

const ORDER_INCLUDE = {
    items: {
        orderBy: { createdAt: "asc" },
    },
    payment: true,
    statusHistory: {
        orderBy: { createdAt: "asc" },
    },
    voucher: {
        select: {
            id: true,
            code: true,
            discountType: true,
            discountValue: true,
        },
    },
};

// ==========================================
// ERROR HELPERS
// ==========================================

function throwError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    throw error;
}

function throwValidationError(field, message) {
    const error = new Error("VALIDATION_ERROR");
    error.statusCode = 400;
    error.details = [{ field, message }];
    throw error;
}

function handleOrderError(error) {
    if (error.code === "P2034") {
        throwError("ORDER_CONCURRENT_UPDATE", 409);
    }

    if (error.code === "P2002") {
        throwError("ORDER_CONFLICT", 409);
    }

    throw error;
}

function assertUuid(value, field = "id") {
    if (
        typeof value !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ) {
        throwValidationError(field, "ID không hợp lệ");
    }
}

// ==========================================
// ORDER NUMBER
// ==========================================

function generateOrderNumber() {
    const date = new Date();

    const datePart = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
    ].join("");

    const randomPart = crypto.randomBytes(4).toString("hex").toUpperCase();

    return `ORD-${datePart}-${randomPart}`;
}

// ==========================================
// MONEY HELPERS
// ==========================================

function calculateVoucherDiscount(voucher, subtotal) {
    let discount = new Prisma.Decimal(0);

    if (voucher.discountType === "PERCENTAGE") {
        discount = subtotal
            .mul(voucher.discountValue)
            .div(100);
    } else if (voucher.discountType === "FIXED_AMOUNT") {
        discount = new Prisma.Decimal(voucher.discountValue);
    }

    if (voucher.maxDiscount !== null) {
        discount = Prisma.Decimal.min(
            discount,
            new Prisma.Decimal(voucher.maxDiscount)
        );
    }

    discount = Prisma.Decimal.min(discount, subtotal);

    return discount.toDecimalPlaces(
        2,
        Prisma.Decimal.ROUND_HALF_UP
    );
}



// ==========================================
// VOUCHER VALIDATION
// ==========================================

async function validateVoucher(tx, { voucherCode, userId, subtotal }) {
    if (!voucherCode) {
        return null;
    }

    const normalizedCode = voucherCode.trim().toUpperCase();

    const voucher = await tx.voucher.findUnique({
        where: { code: normalizedCode },
    });

    if (!voucher) {
        throwError("VOUCHER_NOT_FOUND", 404);
    }

    const now = new Date();

    if (!voucher.isActive) {
        throwError("VOUCHER_INACTIVE", 409);
    }

    if (now < voucher.startsAt || now >= voucher.endsAt) {
        throwError("VOUCHER_OUTSIDE_VALID_PERIOD", 409);
    }

    if (subtotal.lt(voucher.minOrderAmount)) {
        throwError("VOUCHER_MIN_ORDER_AMOUNT_NOT_MET", 400);
    }

    const totalUsage = await tx.voucherUsage.count({
        where: { voucherId: voucher.id },
    });

    if (
        voucher.usageLimit !== null &&
        totalUsage >= voucher.usageLimit
    ) {
        throwError("VOUCHER_USAGE_LIMIT_REACHED", 409);
    }

    const userUsage = await tx.voucherUsage.count({
        where: {
            voucherId: voucher.id,
            userId,
        },
    });

    if (userUsage >= voucher.perUserLimit) {
        throwError("VOUCHER_USER_LIMIT_REACHED", 409);
    }

    return {
        voucher,
        discountAmount: calculateVoucherDiscount(voucher, subtotal),
    };
}

// ==========================================
// CART VALIDATION
// ==========================================

async function getValidatedCart(tx, userId, selectedCartItemIds) {
    if (
        !Array.isArray(selectedCartItemIds) ||
        selectedCartItemIds.length === 0 ||
        new Set(selectedCartItemIds).size !== selectedCartItemIds.length
    ) {
        throwError("INVALID_SELECTED_CART_ITEMS", 400);
    }

    const cart = await tx.cart.findUnique({
        where: { userId },
        include: {
            items: {
                where: {
                    id: {
                        in: selectedCartItemIds,
                    },
                },
                include: {
                    variant: {
                        include: {
                            product: true,
                            inventory: true,
                        },
                    },
                },
            },
        },
    });

    if (!cart) {
        throwError("CART_EMPTY", 400);
    }

    // Đảm bảo tất cả CartItem được yêu cầu đều thuộc giỏ hàng của Customer.
    if (cart.items.length !== selectedCartItemIds.length) {
        throwError("CART_ITEM_NOT_FOUND_OR_NOT_OWNED", 404);
    }

    if (cart.items.length === 0) {
        throwError("CART_EMPTY", 400);
    }

    const validatedItems = [];

    for (const cartItem of cart.items) {
        const variant = cartItem.variant;
        const product = variant.product;
        const inventory = variant.inventory;

        if (product.status !== "ACTIVE") {
            throwError("PRODUCT_NOT_AVAILABLE", 409);
        }

        if (!variant.isActive) {
            throwError("PRODUCT_VARIANT_INACTIVE", 409);
        }

        if (!inventory) {
            throwError("INVENTORY_NOT_FOUND", 404);
        }

        const availableQuantity =
            inventory.quantityOnHand - inventory.reservedQuantity;

        if (availableQuantity < cartItem.quantity) {
            throwError("INSUFFICIENT_STOCK", 409);
        }

        const unitPrice = new Prisma.Decimal(product.price);
        const lineTotal = unitPrice.mul(cartItem.quantity);

        validatedItems.push({
            cartItemId: cartItem.id,
            variantId: variant.id,
            productId: product.id,
            productName: product.name,
            variantName: variant.name,
            sku: variant.sku,
            variantAttributes: variant.attributes,
            quantity: cartItem.quantity,
            unitPrice,
            lineTotal,
            inventory,
        });
    }

    return { cart, items: validatedItems };
}

async function getValidatedBuyNowItem(tx, variantId, quantity) {
    assertUuid(variantId, "variantId");

    if (!Number.isInteger(quantity) || quantity <= 0) {
        throwValidationError(
            "quantity",
            "Số lượng sản phẩm không hợp lệ"
        );
    }

    const variant = await tx.productVariant.findUnique({
        where: { id: variantId },
        include: {
            product: true,
            inventory: true,
        },
    });

    if (!variant) {
        throwError("PRODUCT_VARIANT_NOT_FOUND", 404);
    }

    const product = variant.product;
    const inventory = variant.inventory;

    if (product.status !== "ACTIVE") {
        throwError("PRODUCT_NOT_AVAILABLE", 409);
    }

    if (!variant.isActive) {
        throwError("PRODUCT_VARIANT_INACTIVE", 409);
    }

    if (!inventory) {
        throwError("INVENTORY_NOT_FOUND", 404);
    }

    const availableQuantity =
        inventory.quantityOnHand - inventory.reservedQuantity;

    if (availableQuantity < quantity) {
        throwError("INSUFFICIENT_STOCK", 409);
    }

    const unitPrice = new Prisma.Decimal(product.price);
    const lineTotal = unitPrice.mul(quantity);

    return [{
        variantId: variant.id,
        productId: product.id,
        productName: product.name,
        variantName: variant.name,
        sku: variant.sku,
        variantAttributes: variant.attributes,
        quantity,
        unitPrice,
        lineTotal,
        inventory,
    }];
}

// Restore eligible order items to customer's cart after cancellation.
async function restoreOrderItemsToCart(tx, order) {
    if (!order?.userId || !Array.isArray(order.items)) {
        throwError("INVALID_ORDER_DATA", 400);
    }

    // Buy Now orders must not be restored to the shopping cart.
    if (order.source !== "CART") {
        return null;
    }

    const cart = await tx.cart.upsert({
        where: {
            userId: order.userId,
        },
        create: {
            userId: order.userId,
        },
        update: {},
    });

    for (const item of order.items) {
        const variant = await tx.productVariant.findFirst({
            where: {
                id: item.variantId,
                isActive: true,
                product: {
                    is: {
                        status: "ACTIVE",
                    },
                },
            },
            select: {
                id: true,
            },
        });

        // Do not restore products or variants that are no longer sellable.
        if (!variant) continue;

        await tx.cartItem.upsert({
            where: {
                cartId_variantId: {
                    cartId: cart.id,
                    variantId: item.variantId,
                },
            },
            create: {
                cartId: cart.id,
                variantId: item.variantId,
                quantity: item.quantity,
            },
            update: {
                quantity: {
                    increment: item.quantity,
                },
            },
        });
    }

    return cart;
}


// ==========================================
// INVENTORY HELPERS
// ==========================================

// Reserve stock at order creation.
// Database condition guarantees:
// quantityOnHand - reservedQuantity >= requested quantity.

async function reserveInventory(tx, items) {
    for (const item of items) {
        const inventory = item.inventory;

        const result = await tx.inventory.updateMany({
            where: {
                id: inventory.id,
                AND: [
                    {
                        quantityOnHand: inventory.quantityOnHand,
                    },
                    {
                        reservedQuantity: inventory.reservedQuantity,
                    },
                    {
                        quantityOnHand: {
                            gte: inventory.reservedQuantity + item.quantity,
                        },
                    },
                ],
            },
            data: {
                reservedQuantity: {
                    increment: item.quantity,
                },
            },
        });

        if (result.count !== 1) {
            throwError("INSUFFICIENT_STOCK_OR_CONCURRENT_UPDATE", 409);
        }
    }
}

async function createOrderFromValidatedItems(tx, {
    userId,
    input,
    items,
    source,
    cart = null,
    selectedCartItemIds = [],
}) {
    const {
        paymentMethod,
        voucherCode,
        shippingRecipientName,
        shippingPhone,
        shippingProvinceCity,
        shippingDistrict,
        shippingStreet,
        shippingAddressNote,
        customerNote,
    } = input;

    const subtotal = items.reduce(
        (total, item) => total.add(item.lineTotal),
        new Prisma.Decimal(0)
    );

    const voucherResult = await validateVoucher(tx, {
        voucherCode,
        userId,
        subtotal,
    });

    const voucher = voucherResult?.voucher || null;

    const discountAmount = voucherResult
        ? voucherResult.discountAmount
        : new Prisma.Decimal(0);

    const allocatedItems = allocateVoucherDiscount(
        items,
        discountAmount,
        subtotal
    );

    const totalAmount = subtotal
        .sub(discountAmount)
        .add(SHIPPING_FEE);

    if (totalAmount.lt(0)) {
        throwError("INVALID_ORDER_TOTAL", 400);
    }

    await reserveInventory(tx, items);

    const order = await tx.order.create({
        data: {
            orderNumber: generateOrderNumber(),
            userId,
            source,
            voucherId: voucher?.id || null,
            status: "PENDING_CONFIRMATION",
            paymentMethod,
            subtotal,
            discountAmount,
            shippingFee: SHIPPING_FEE,
            totalAmount,
            shippingRecipientName,
            shippingPhone,
            shippingProvinceCity,
            shippingDistrict,
            shippingStreet,
            shippingAddressNote: shippingAddressNote || null,
            customerNote: customerNote || null,
            items: {
                create: allocatedItems.map((item) => ({
                    id: crypto.randomUUID(),
                    productId: item.productId,
                    variantId: item.variantId,
                    productName: item.productName,
                    variantName: item.variantName,
                    sku: item.sku,
                    variantAttributes: item.variantAttributes,
                    unitPrice: item.unitPrice,
                    quantity: item.quantity,
                    lineTotal: item.lineTotal,
                    discountAmount: item.discountAmount,
                })),
            },
        },
    });

    await tx.payment.create({
        data: {
            orderId: order.id,
            method: paymentMethod,
            status: "PENDING",
            amount: totalAmount,
        },
    });

    await createOrderHistory(tx, {
        orderId: order.id,
        changedById: null,
        oldStatus: null,
        newStatus: "PENDING_CONFIRMATION",
        note: "Order created by customer",
    });

    if (voucher) {
        await tx.voucherUsage.create({
            data: {
                voucherId: voucher.id,
                userId,
                orderId: order.id,
                discountAmount,
            },
        });
    }

    // Only CART orders remove selected items from the shopping cart.
    if (source === "CART") {
        if (!cart || selectedCartItemIds.length === 0) {
            throwError("INVALID_SELECTED_CART_ITEMS", 400);
        }

        const deletedCartItems = await tx.cartItem.deleteMany({
            where: {
                cartId: cart.id,
                id: { in: selectedCartItemIds },
            },
        });

        if (deletedCartItems.count !== selectedCartItemIds.length) {
            throwError("CART_ITEMS_CHANGED_DURING_CHECKOUT", 409);
        }
    }

    return tx.order.findUnique({
        where: { id: order.id },
        include: ORDER_INCLUDE,
    });
}

// Release reserved stock before confirmation.
// Database guarantees reservedQuantity cannot become negative.

async function releaseReservedInventory(tx, item) {
    const inventory = await tx.inventory.findUnique({
        where: { variantId: item.variantId },
    });

    if (!inventory) {
        throwError("INVENTORY_NOT_FOUND", 404);
    }

    const result = await tx.inventory.updateMany({
        where: {
            id: inventory.id,
            reservedQuantity: {
                gte: item.quantity,
            },
        },
        data: {
            reservedQuantity: {
                decrement: item.quantity,
            },
        },
    });

    if (result.count !== 1) {
        throwError("INVENTORY_RESERVATION_INCONSISTENT", 409);
    }
}

// Confirm order: reduce both on-hand and reserved stock.
// Create SALE movement.

async function deductReservedInventory(tx, order, adminId) {
    for (const item of order.items) {
        const inventory = await tx.inventory.findUnique({
            where: { variantId: item.variantId },
        });

        if (!inventory) {
            throwError("INVENTORY_NOT_FOUND", 404);
        }

        if (
            inventory.quantityOnHand < item.quantity ||
            inventory.reservedQuantity < item.quantity
        ) {
            throwError("INVENTORY_RESERVATION_INCONSISTENT", 409);
        }

        const result = await tx.inventory.updateMany({
            where: {
                id: inventory.id,
                AND: [
                    {
                        quantityOnHand: inventory.quantityOnHand,
                    },
                    {
                        reservedQuantity: inventory.reservedQuantity,
                    },
                    {
                        quantityOnHand: {
                            gte: item.quantity,
                        },
                    },
                    {
                        reservedQuantity: {
                            gte: item.quantity,
                        },
                    },
                ],
            },
            data: {
                quantityOnHand: {
                    decrement: item.quantity,
                },
                reservedQuantity: {
                    decrement: item.quantity,
                },
            },
        });

        if (result.count !== 1) {
            throwError("ORDER_CONCURRENT_UPDATE", 409);
        }

        await tx.inventoryMovement.create({
            data: {
                variantId: item.variantId,
                type: "SALE",
                quantity: -item.quantity,
                beforeStock: inventory.quantityOnHand,
                afterStock: inventory.quantityOnHand - item.quantity,
                referenceId: order.id,
                note: `Stock deducted for order ${order.orderNumber}`,
                createdBy: adminId,
            },
        });
    }
}

// Restore on-hand stock after an already-confirmed order is cancelled.

async function restoreSoldInventory(tx, order, actorId) {
    for (const item of order.items) {
        const inventory = await tx.inventory.findUnique({
            where: { variantId: item.variantId },
        });

        if (!inventory) {
            throwError("INVENTORY_NOT_FOUND", 404);
        }

        const result = await tx.inventory.updateMany({
            where: {
                id: inventory.id,
                quantityOnHand: inventory.quantityOnHand,
                reservedQuantity: inventory.reservedQuantity,
            },
            data: {
                quantityOnHand: {
                    increment: item.quantity,
                },
            },
        });

        if (result.count !== 1) {
            throwError("ORDER_CONCURRENT_UPDATE", 409);
        }

        await tx.inventoryMovement.create({
            data: {
                variantId: item.variantId,
                type: "ORDER_CANCEL",
                quantity: item.quantity,
                beforeStock: inventory.quantityOnHand,
                afterStock: inventory.quantityOnHand + item.quantity,
                referenceId: order.id,
                note: `Stock restored after cancelling order ${order.orderNumber}`,
                createdBy: actorId,
            },
        });
    }
}

// ==========================================
// ORDER HISTORY
// ==========================================

async function createOrderHistory(
    tx,
    { orderId, changedById, oldStatus, newStatus, note }
) {
    await tx.orderStatusHistory.create({
        data: {
            orderId,
            changedById: changedById || null,
            oldStatus: oldStatus || null,
            newStatus,
            note: note || null,
        },
    });
}

// ==========================================
// RETURN / EXCHANGE INTEGRATION
// ==========================================

// Complete an exchange request when its replacement order is delivered.
async function completeReplacementReturn(tx, order, adminId, now) {
    const request = await tx.returnRequest.findUnique({
        where: {
            replacementOrderId: order.id,
        },
        include: {
            items: true,
        },
    });

    if (!request) {
        throwError("EXCHANGE_RETURN_REQUEST_NOT_FOUND", 409);
    }

    if (
        request.resolution !== "EXCHANGE" ||
        request.status !== "REPLACEMENT_PENDING" ||
        request.items.length !== 1
    ) {
        throwError("EXCHANGE_RETURN_REQUEST_STATE_INVALID", 409);
    }

    const returnItem = request.items[0];

    if (returnItem.status !== "REPLACEMENT_PENDING") {
        throwError("EXCHANGE_RETURN_ITEM_STATE_INVALID", 409);
    }

    const itemResult = await tx.returnItem.updateMany({
        where: {
            id: returnItem.id,
            returnRequestId: request.id,
            status: "REPLACEMENT_PENDING",
        },
        data: {
            status: "COMPLETED",
        },
    });

    if (itemResult.count !== 1) {
        throwError("EXCHANGE_RETURN_ITEM_CONCURRENT_UPDATE", 409);
    }

    const requestResult = await tx.returnRequest.updateMany({
        where: {
            id: request.id,
            replacementOrderId: order.id,
            resolution: "EXCHANGE",
            status: "REPLACEMENT_PENDING",
        },
        data: {
            status: "COMPLETED",
            processedById: adminId,
            processedAt: now,
            adminNote: "Đơn hàng thay thế đã được giao thành công",
        },
    });

    if (requestResult.count !== 1) {
        throwError("EXCHANGE_RETURN_REQUEST_CONCURRENT_UPDATE", 409);
    }
}

// Return an exchange request to WAITING_FOR_STOCK
// when its replacement order is cancelled before shipping.
async function resetCancelledReplacementReturn(
    tx,
    order,
    adminId
) {
    const request = await tx.returnRequest.findUnique({
        where: {
            replacementOrderId: order.id,
        },
        include: {
            items: true,
        },
    });

    if (!request) {
        throwError("EXCHANGE_RETURN_REQUEST_NOT_FOUND", 409);
    }

    if (
        request.resolution !== "EXCHANGE" ||
        request.status !== "REPLACEMENT_PENDING" ||
        request.items.length !== 1
    ) {
        throwError("EXCHANGE_RETURN_REQUEST_STATE_INVALID", 409);
    }

    const returnItem = request.items[0];

    if (returnItem.status !== "REPLACEMENT_PENDING") {
        throwError("EXCHANGE_RETURN_ITEM_STATE_INVALID", 409);
    }

    const itemResult = await tx.returnItem.updateMany({
        where: {
            id: returnItem.id,
            returnRequestId: request.id,
            status: "REPLACEMENT_PENDING",
        },
        data: {
            status: "WAITING_FOR_STOCK",
        },
    });

    if (itemResult.count !== 1) {
        throwError("EXCHANGE_RETURN_ITEM_CONCURRENT_UPDATE", 409);
    }

    const requestResult = await tx.returnRequest.updateMany({
        where: {
            id: request.id,
            replacementOrderId: order.id,
            resolution: "EXCHANGE",
            status: "REPLACEMENT_PENDING",
        },
        data: {
            status: "WAITING_FOR_STOCK",
            replacementOrderId: null,
            processedById: adminId,
            processedAt: null,
            adminNote: "Đơn hàng thay thế đã bị hủy; yêu cầu đổi hàng đang chờ tạo đơn thay thế mới",
        },
    });

    if (requestResult.count !== 1) {
        throwError("EXCHANGE_RETURN_REQUEST_CONCURRENT_UPDATE", 409);
    }
}

// ==========================================
// CREATE ORDER
// ==========================================

async function createOrder(userId, input) {
    const { selectedCartItemIds } = input;

    assertUuid(userId, "userId");

    if (
        !Array.isArray(selectedCartItemIds) ||
        selectedCartItemIds.length === 0 ||
        new Set(selectedCartItemIds).size !== selectedCartItemIds.length
    ) {
        throwValidationError(
            "selectedCartItemIds",
            "Danh sách sản phẩm được chọn không hợp lệ"
        );
    }

    if (!["COD", "VNPAY"].includes(input.paymentMethod)) {
        throwValidationError(
            "paymentMethod",
            "Phương thức thanh toán không hợp lệ"
        );
    }

    try {
        return await prisma.$transaction(
            async (tx) => {
                const { cart, items } = await getValidatedCart(
                    tx,
                    userId,
                    selectedCartItemIds
                );

                return createOrderFromValidatedItems(tx, {
                    userId,
                    input,
                    items,
                    source: "CART",
                    cart,
                    selectedCartItemIds,
                });
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            }
        );
    } catch (error) {
        handleOrderError(error);
    }
}

async function createBuyNowOrder(userId, input) {
    const { variantId, quantity } = input;

    assertUuid(userId, "userId");

    if (!["COD", "VNPAY"].includes(input.paymentMethod)) {
        throwValidationError(
            "paymentMethod",
            "Phương thức thanh toán không hợp lệ"
        );
    }

    try {
        return await prisma.$transaction(
            async (tx) => {
                const items = await getValidatedBuyNowItem(
                    tx,
                    variantId,
                    quantity
                );

                return createOrderFromValidatedItems(tx, {
                    userId,
                    input,
                    items,
                    source: "BUY_NOW",
                });
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            }
        );
    } catch (error) {
        console.error("[BUY_NOW_ORDER_ERROR]", {
            message: error.message,
            name: error.name,
            code: error.code,
            statusCode: error.statusCode,
            meta: error.meta,
            stack: error.stack,
        });

        handleOrderError(error);
    }
}

// ==========================================
// CUSTOMER: LIST ORDERS
// ==========================================

// ==========================================
// START VNPAY CHECKOUT
// ==========================================

async function startCheckout(orderId, userId) {
    assertUuid(orderId, "orderId");
    assertUuid(userId, "userId");

    return prisma.$transaction(async (tx) => {
        const order = await tx.order.findFirst({
            where: {
                id: orderId,
                userId,
            },
            include: {
                payment: true,
            },
        });

        if (!order) {
            throwError("ORDER_NOT_FOUND", 404);
        }

        if (order.paymentMethod !== "VNPAY") {
            throwError("CHECKOUT_NOT_REQUIRED", 409);
        }

        if (order.status !== "PENDING_CONFIRMATION") {
            throwError("ORDER_NOT_AVAILABLE_FOR_CHECKOUT", 409);
        }

        if (!order.payment) {
            throwError("PAYMENT_NOT_FOUND", 404);
        }

        if (order.payment.method !== "VNPAY") {
            throwError("PAYMENT_METHOD_MISMATCH", 409);
        }

        if (order.payment.status !== "PENDING") {
            throwError("PAYMENT_NOT_PENDING", 409);
        }

        const now = new Date();

        // Không gia hạn phiên checkout đã bắt đầu.
        if (order.payment.checkoutStartedAt) {
            if (
                !order.payment.expiresAt ||
                order.payment.expiresAt <= now
            ) {
                throwError("PAYMENT_SESSION_EXPIRED", 409);
            }
        } else {
            const expiresAt = new Date(
                now.getTime() + 10 * 60 * 1000
            );

            // Atomic update: chỉ một request được khởi tạo phiên.
            const result = await tx.payment.updateMany({
                where: {
                    id: order.payment.id,
                    status: "PENDING",
                    checkoutStartedAt: null,
                },
                data: {
                    checkoutStartedAt: now,
                    expiresAt,
                },
            });

            let payment;

            if (result.count === 1) {
                payment = await tx.payment.findUnique({
                    where: {
                        id: order.payment.id,
                    },
                });
            } else {
                // Một request khác có thể đã khởi tạo phiên trước.
                payment = await tx.payment.findUnique({
                    where: {
                        id: order.payment.id,
                    },
                });
            }

            if (
                !payment ||
                !payment.checkoutStartedAt ||
                !payment.expiresAt
            ) {
                throwError("CHECKOUT_SESSION_INITIALIZATION_FAILED", 409);
            }

            if (payment.expiresAt <= new Date()) {
                throwError("PAYMENT_SESSION_EXPIRED", 409);
            }

            order.payment = payment;
        }

        const remainingSeconds = Math.max(
            0,
            Math.ceil(
                (order.payment.expiresAt.getTime() - Date.now()) / 1000
            )
        );

        return {
            orderId: order.id,
            paymentId: order.payment.id,
            paymentMethod: order.payment.method,
            paymentStatus: order.payment.status,
            checkoutStartedAt: order.payment.checkoutStartedAt,
            expiresAt: order.payment.expiresAt,
            remainingSeconds,
        };
    });
}

async function expirePendingVnpayOrders() {

    const scanTime = new Date();

    const expiredPayments = await prisma.payment.findMany({
        where: {
            method: "VNPAY",
            status: "PENDING",
            checkoutStartedAt: { not: null },
            expiresAt: { lte: scanTime },
            order: {
                is: {
                    paymentMethod: "VNPAY",
                    status: "PENDING_CONFIRMATION",
                },
            },
        },
        select: {
            id: true,
        },
        orderBy: {
            expiresAt: "asc",
        },
        take: 100,
    });

    let expiredCount = 0;

    for (const candidate of expiredPayments) {
        try {
            const now = new Date();

            const expired = await prisma.$transaction(
                async (tx) => {
                    const payment = await tx.payment.findUnique({
                        where: { id: candidate.id },
                        include: {
                            order: {
                                include: {
                                    items: true,
                                },
                            },
                        },
                    });

                    if (
                        !payment ||
                        payment.method !== "VNPAY" ||
                        payment.status !== "PENDING" ||
                        !payment.expiresAt ||
                        payment.expiresAt > now ||
                        !payment.order ||
                        payment.order.paymentMethod !== "VNPAY" ||
                        payment.order.status !== "PENDING_CONFIRMATION"
                    ) {
                        return false;
                    }

                    // Step 1: Claim the expired payment using CAS.
                    const paymentResult = await tx.payment.updateMany({
                        where: {
                            id: payment.id,
                            method: "VNPAY",
                            status: "PENDING",
                            expiresAt: { lte: now },
                        },
                        data: {
                            status: "CANCELLED",
                        },
                    });

                    if (paymentResult.count !== 1) {
                        return false;
                    }

                    // Step 2: Cancel the order using CAS.
                    const orderResult = await tx.order.updateMany({
                        where: {
                            id: payment.order.id,
                            paymentMethod: "VNPAY",
                            status: "PENDING_CONFIRMATION",
                        },
                        data: {
                            status: "CANCELLED",
                            cancelledAt: now,
                        },
                    });

                    if (orderResult.count !== 1) {
                        // Roll back the payment update as well.
                        const error = new Error("VNPAY_EXPIRY_ORDER_RACE");
                        error.code = "VNPAY_EXPIRY_ORDER_RACE";
                        throw error;
                    }

                    // Step 3: Release reserved inventory.
                    for (const item of payment.order.items) {
                        await releaseReservedInventory(tx, item);
                    }

                    // Step 4: Restore eligible items to the cart.
                    await restoreOrderItemsToCart(tx, payment.order);

                    // Step 5: Create order status history.
                    await createOrderHistory(tx, {
                        orderId: payment.order.id,
                        changedById: null,
                        oldStatus: payment.order.status,
                        newStatus: "CANCELLED",
                        note: "VNPAY payment expired",
                    });

                    // Step 6: Release voucher usage.
                    await tx.voucherUsage.deleteMany({
                        where: {
                            orderId: payment.order.id,
                        },
                    });

                    return true;
                },
                {
                    isolationLevel:
                        Prisma.TransactionIsolationLevel.Serializable,
                }
            );

            if (expired) {
                expiredCount++;
            }
        } catch (error) {
            if (
                error.code === "VNPAY_EXPIRY_ORDER_RACE" ||
                error.code === "P2034"
            ) {
                continue;
            }

            throw error;
        }
    }

    return {
        scanned: expiredPayments.length,
        expired: expiredCount,
    };
}

async function listMyOrders(userId, query = {}) {
    assertUuid(userId, "userId");

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where = {
        userId,
        ...(query.status ? { status: query.status } : {}),
    };

    const [orders, total] = await prisma.$transaction([
        prisma.order.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: "desc" },
            include: {
                items: true,
                payment: true,
            },
        }),
        prisma.order.count({ where }),
    ]);

    return {
        data: orders,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}

// ==========================================
// CUSTOMER: GET ORDER DETAIL
// ==========================================

async function getMyOrderById(userId, orderId) {
    assertUuid(userId, "userId");
    assertUuid(orderId, "orderId");

    const order = await prisma.order.findFirst({
        where: {
            id: orderId,
            userId,
        },
        include: ORDER_INCLUDE,
    });

    if (!order) {
        throwError("ORDER_NOT_FOUND", 404);
    }

    return order;
}

// ==========================================
// CUSTOMER: CANCEL ORDER
// Only PENDING_CONFIRMATION
// ==========================================


async function cancelMyOrder(userId, orderId, note = null) {
    assertUuid(userId, "userId");
    assertUuid(orderId, "orderId");

    try {
        return await prisma.$transaction(
            async (tx) => {
                const order = await tx.order.findFirst({
                    where: {
                        id: orderId,
                        userId,
                    },
                    include: {
                        items: true,
                        payment: true,
                    },
                });

                if (!order) {
                    throwError("ORDER_NOT_FOUND", 404);
                }

                // Only COD and unpaid VNPAY orders can use normal cancellation.
                if (!["COD", "VNPAY"].includes(order.paymentMethod)) {
                    throwError("UNSUPPORTED_PAYMENT_METHOD", 409);
                }

                // Paid orders must go through customer service and refund.
                if (order.payment?.status === "PAID") {
                    throwError("PAID_ORDER_REQUIRES_REFUND", 409);
                }

                const allowedStatuses =
                    order.paymentMethod === "COD"
                        ? [
                            "PENDING_CONFIRMATION",
                            "CONFIRMED",
                            "PROCESSING",
                            "SHIPPING",
                        ]
                        : ["PENDING_CONFIRMATION"];

                if (!allowedStatuses.includes(order.status)) {
                    throwError("ORDER_CANNOT_BE_CANCELLED", 409);
                }

                if (
                    order.payment?.status !== "PENDING" &&
                    order.payment?.status !== "FAILED"
                ) {
                    throwError("PAYMENT_CANNOT_BE_CANCELLED", 409);
                }

                // Step 1: Cancel order using compare-and-set.
                const result = await tx.order.updateMany({
                    where: {
                        id: order.id,
                        status: order.status,
                    },
                    data: {
                        status: "CANCELLED",
                        cancelledAt: new Date(),
                    },
                });

                if (result.count !== 1) {
                    throwError("ORDER_CONCURRENT_UPDATE", 409);
                }

                // Step 2: Restore inventory according to order lifecycle.
                if (order.status === "PENDING_CONFIRMATION") {
                    // Stock was reserved but not deducted.
                    for (const item of order.items) {
                        await releaseReservedInventory(tx, item);
                    }
                } else {
                    // Stock was already deducted after confirmation.
                    // userId is valid because InventoryMovement.createdBy
                    // references User, not exclusively Admin.
                    await restoreSoldInventory(tx, order, userId);
                }

                // Step 3: Restore eligible items to customer's cart.
                await restoreOrderItemsToCart(tx, order);

                // Step 4: Create order status history.
                await createOrderHistory(tx, {
                    orderId: order.id,
                    changedById: userId,
                    oldStatus: order.status,
                    newStatus: "CANCELLED",
                    note: note || "Cancelled by customer",
                });

                // Step 5: Release voucher usage.
                await tx.voucherUsage.deleteMany({
                    where: {
                        orderId: order.id,
                    },
                });

                // Step 6: Cancel unpaid payment.
                if (
                    order.payment &&
                    ["PENDING", "FAILED"].includes(order.payment.status)
                ) {
                    await tx.payment.updateMany({
                        where: {
                            id: order.payment.id,
                            status: order.payment.status,
                        },
                        data: {
                            status: "CANCELLED",
                        },
                    });
                }

                return tx.order.findUnique({
                    where: {
                        id: order.id,
                    },
                    include: ORDER_INCLUDE,
                });
            },
            {
                isolationLevel:
                    Prisma.TransactionIsolationLevel.Serializable,
            }
        );
    } catch (error) {
        handleOrderError(error);
    }
}


// ==========================================
// ADMIN: LIST ORDERS
// ==========================================

async function listAdminOrders(query = {}) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.paymentMethod
            ? { paymentMethod: query.paymentMethod }
            : {}),
        ...(query.paymentStatus
            ? { payment: { is: { status: query.paymentStatus } } }
            : {}),
        ...(query.search
            ? {
                OR: [
                    {
                        orderNumber: {
                            contains: query.search,
                            mode: "insensitive",
                        },
                    },
                    {
                        shippingRecipientName: {
                            contains: query.search,
                            mode: "insensitive",
                        },
                    },
                    {
                        shippingPhone: {
                            contains: query.search,
                        },
                    },
                ],
            }
            : {}),
    };

    const [orders, total] = await prisma.$transaction([
        prisma.order.findMany({
            where,
            skip,
            take: limit,
            orderBy: {
                createdAt: query.sortOrder || "desc",
            },
            include: {
                items: true,
                payment: true,
                user: {
                    select: {
                        id: true,
                        email: true,
                        fullName: true,
                    },
                },
            },
        }),
        prisma.order.count({ where }),
    ]);

    return {
        data: orders,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}

// ==========================================
// ADMIN: GET ORDER DETAIL
// ==========================================

async function getAdminOrderById(orderId) {
    assertUuid(orderId, "orderId");

    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
            ...ORDER_INCLUDE,
            user: {
                select: {
                    id: true,
                    email: true,
                    fullName: true,
                    phone: true,
                },
            },
            voucherUsage: true,
        },
    });

    if (!order) {
        throwError("ORDER_NOT_FOUND", 404);
    }

    return order;
}

// ==========================================
// ADMIN: MARK COD PAID
// ==========================================

async function markOrderPaid(orderId, adminId, note = null) {
    assertUuid(orderId, "orderId");
    assertUuid(adminId, "adminId");

    try {
        return await prisma.$transaction(
            async (tx) => {
                const order = await tx.order.findUnique({
                    where: { id: orderId },
                    include: { payment: true },
                });

                if (!order) {
                    throwError("ORDER_NOT_FOUND", 404);
                }

                if (order.paymentMethod !== "COD") {
                    throwError("COD_PAYMENT_METHOD_REQUIRED", 409);
                }

                if (order.status !== "DELIVERED") {
                    throwError("COD_PAYMENT_REQUIRES_DELIVERED_ORDER", 409);
                }

                if (!order.payment) {
                    throwError("PAYMENT_NOT_FOUND", 404);
                }

                if (order.payment.status === "PAID") {
                    throwError("PAYMENT_ALREADY_PAID", 409);
                }

                if (order.payment.status !== "PENDING") {
                    throwError("PAYMENT_CANNOT_BE_MARKED_PAID", 409);
                }

                const paymentResult = await tx.payment.updateMany({
                    where: {
                        id: order.payment.id,
                        status: "PENDING",
                    },
                    data: {
                        status: "PAID",
                        paidAt: new Date(),
                    },
                });

                if (paymentResult.count !== 1) {
                    throwError("ORDER_CONCURRENT_UPDATE", 409);
                }

                await tx.paymentTransaction.create({
                    data: {
                        paymentId: order.payment.id,
                        type: "QUERY",
                        requestData: {
                            source: "ADMIN_COD_CONFIRMATION",
                            orderId: order.id,
                            adminId,
                        },
                        responseData: {
                            result: "PAID",
                            note: note || null,
                        },
                        idempotencyKey: `COD-${order.id}-${crypto.randomUUID()}`,
                        isSuccessful: true,
                    },
                });

                return tx.payment.findUnique({
                    where: { id: order.payment.id },
                });
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            }
        );
    } catch (error) {
        handleOrderError(error);
    }
}

// ==========================================
// ADMIN: UPDATE ORDER STATUS
// ==========================================

async function updateOrderStatus(orderId, newStatus, adminId, note = null) {
    assertUuid(orderId, "orderId");
    assertUuid(adminId, "adminId");

    if (!ORDER_STATUSES.includes(newStatus)) {
        throwValidationError("status", "Trạng thái đơn hàng không hợp lệ");
    }

    try {
        return await prisma.$transaction(
            async (tx) => {
                const order = await tx.order.findUnique({
                    where: { id: orderId },
                    include: {
                        items: true,
                        payment: true,
                    },
                });

                if (!order) {
                    throwError("ORDER_NOT_FOUND", 404);
                }

                if (!order.payment) {
                    throwError("PAYMENT_NOT_FOUND", 404);
                }

                // Payment method must match the order.
                if (order.payment.method !== order.paymentMethod) {
                    throwError("PAYMENT_METHOD_MISMATCH", 409);
                }

                // VNPAY orders must be paid before status progression.
                if (order.paymentMethod === "VNPAY") {
                    if (order.payment.status !== "PAID") {
                        throwError("ORDER_PAYMENT_NOT_PAID", 409);
                    }
                } else if (order.paymentMethod === "COD") {
                    if (
                        newStatus === "COMPLETED" &&
                        order.payment.status !== "PAID"
                    ) {
                        throwError("COD_PAYMENT_NOT_COLLECTED", 409);
                    }

                    if (
                        newStatus !== "COMPLETED" &&
                        order.payment.status !== "PENDING"
                    ) {
                        throwError("COD_PAYMENT_STATE_INVALID", 409);
                    }
                } else if (order.paymentMethod === "INTERNAL_EXCHANGE") {
                    if (order.payment.status !== "NOT_REQUIRED") {
                        throwError(
                            "INTERNAL_EXCHANGE_PAYMENT_STATE_INVALID",
                            409
                        );
                    }
                } else {
                    throwError("UNSUPPORTED_PAYMENT_METHOD", 409);
                }

                const allowedNextStatuses =
                    ALLOWED_TRANSITIONS[order.status] || [];

                if (!allowedNextStatuses.includes(newStatus)) {
                    throwError("INVALID_ORDER_STATUS_TRANSITION", 409);
                }

                const now = new Date();

                // Update order using compare-and-set.
                const updateResult = await tx.order.updateMany({
                    where: {
                        id: order.id,
                        status: order.status,
                    },
                    data: {
                        status: newStatus,

                        ...(newStatus === "DELIVERED"
                            ? { deliveredAt: now }
                            : {}),

                        ...(newStatus === "COMPLETED"
                            ? { completedAt: now }
                            : {}),
                    },
                });

                if (updateResult.count !== 1) {
                    throwError("ORDER_CONCURRENT_UPDATE", 409);
                }

                // Deduct reserved stock only when confirming the order.
                if (
                    order.status === "PENDING_CONFIRMATION" &&
                    newStatus === "CONFIRMED"
                ) {
                    await deductReservedInventory(tx, order, adminId);
                }

                await createOrderHistory(tx, {
                    orderId: order.id,
                    changedById: adminId,
                    oldStatus: order.status,
                    newStatus,
                    note: note || null,
                });

                // An exchange request is completed when its replacement
                // order reaches DELIVERED, not COMPLETED.
                if (
                    order.paymentMethod === "INTERNAL_EXCHANGE" &&
                    newStatus === "DELIVERED"
                ) {
                    await completeReplacementReturn(
                        tx,
                        order,
                        adminId,
                        now
                    );
                }

                return tx.order.findUnique({
                    where: { id: order.id },
                    include: ORDER_INCLUDE,
                });
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            }
        );
    } catch (error) {
        handleOrderError(error);
    }
}

// ==========================================
// ADMIN: CANCEL ORDER
// Normal orders: before successful delivery.
// Replacement orders: before SHIPPING.
// Paid payment remains PAID until refund succeeds.
// ==========================================

async function cancelAdminOrder(orderId, adminId, note = null) {
    assertUuid(orderId, "orderId");
    assertUuid(adminId, "adminId");

    try {
        return await prisma.$transaction(
            async (tx) => {
                const order = await tx.order.findUnique({
                    where: { id: orderId },
                    include: {
                        items: true,
                        payment: true,
                    },
                });

                if (!order) {
                    throwError("ORDER_NOT_FOUND", 404);
                }

                if (!order.payment) {
                    throwError("PAYMENT_NOT_FOUND", 404);
                }

                if (order.payment.method !== order.paymentMethod) {
                    throwError("PAYMENT_METHOD_MISMATCH", 409);
                }

                const isReplacementOrder =
                    order.paymentMethod === "INTERNAL_EXCHANGE";

                // Replacement orders cannot be cancelled after shipping.
                // Their physical goods may already be in transit.
                if (
                    isReplacementOrder &&
                    order.status === "SHIPPING"
                ) {
                    throwError(
                        "REPLACEMENT_ORDER_ALREADY_SHIPPED",
                        409
                    );
                }

                if (
                    !ADMIN_CANCELLABLE_STATUSES.includes(order.status)
                ) {
                    throwError("ORDER_CANNOT_BE_CANCELLED", 409);
                }

                // Validate payment state before changing anything.
                if (isReplacementOrder) {
                    if (order.payment.status !== "NOT_REQUIRED") {
                        throwError(
                            "INTERNAL_EXCHANGE_PAYMENT_STATE_INVALID",
                            409
                        );
                    }
                } else {
                    if (order.payment.status === "PAID") {
                        throwError("PAID_ORDER_REQUIRES_REFUND", 409);
                    }

                    if (
                        !["PENDING", "FAILED"].includes(
                            order.payment.status
                        )
                    ) {
                        throwError("PAYMENT_CANNOT_BE_CANCELLED", 409);
                    }
                }

                const now = new Date();

                // Step 1: Cancel order using compare-and-set.
                const updateResult = await tx.order.updateMany({
                    where: {
                        id: order.id,
                        status: order.status,
                    },
                    data: {
                        status: "CANCELLED",
                        cancelledAt: now,
                    },
                });

                if (updateResult.count !== 1) {
                    throwError("ORDER_CONCURRENT_UPDATE", 409);
                }

                // Step 2: Release or restore inventory.
                if (order.status === "PENDING_CONFIRMATION") {
                    // Stock was reserved but not deducted.
                    for (const item of order.items) {
                        await releaseReservedInventory(tx, item);
                    }
                } else if (
                    ["CONFIRMED", "PROCESSING", "SHIPPING"].includes(order.status)
                ) {
                    // Stock was already deducted at confirmation.
                    await restoreSoldInventory(tx, order, adminId);
                }

                // Step 3: Create order status history.
                await createOrderHistory(tx, {
                    orderId: order.id,
                    changedById: adminId,
                    oldStatus: order.status,
                    newStatus: "CANCELLED",
                    note: note || "Cancelled by admin",
                });

                // Step 4: Remove voucher usage.
                await tx.voucherUsage.deleteMany({
                    where: {
                        orderId: order.id,
                    },
                });

                if (isReplacementOrder) {
                    // Step 5A: Return the exchange request to stock waiting.
                    await resetCancelledReplacementReturn(
                        tx,
                        order,
                        adminId
                    );
                } else {
                    // Step 5B: Cancel unpaid normal payment.
                    const paymentUpdateResult =
                        await tx.payment.updateMany({
                            where: {
                                id: order.payment.id,
                                status: order.payment.status,
                            },
                            data: {
                                status: "CANCELLED",
                            },
                        });

                    if (paymentUpdateResult.count !== 1) {
                        throwError(
                            "PAYMENT_CONCURRENT_UPDATE",
                            409
                        );
                    }
                }

                return tx.order.findUnique({
                    where: {
                        id: order.id,
                    },
                    include: ORDER_INCLUDE,
                });
            },
            {
                isolationLevel:
                    Prisma.TransactionIsolationLevel.Serializable,
            }
        );
    } catch (error) {
        handleOrderError(error);
    }
}


async function previewOrderVoucher(userId, input) {
    assertUuid(userId, "userId");

    if (!input || typeof input !== "object") {
        throwValidationError("body", "Dữ liệu kiểm tra voucher không hợp lệ");
    }

    const { code, selectedCartItemIds } = input;

    if (typeof code !== "string" || !code.trim()) {
        throwValidationError("code", "Vui lòng nhập mã giảm giá");
    }

    if (
        !Array.isArray(selectedCartItemIds) ||
        selectedCartItemIds.length === 0 ||
        selectedCartItemIds.length > 100 ||
        new Set(selectedCartItemIds).size !== selectedCartItemIds.length
    ) {
        throwValidationError(
            "selectedCartItemIds",
            "Danh sách sản phẩm được chọn không hợp lệ"
        );
    }

    for (const id of selectedCartItemIds) {
        assertUuid(id, "selectedCartItemIds");
    }

    try {
        return await prisma.$transaction(
            async (tx) => {
                const { items } = await getValidatedCart(
                    tx,
                    userId,
                    selectedCartItemIds
                );

                const subtotal = items.reduce(
                    (total, item) => total.add(item.lineTotal),
                    new Prisma.Decimal(0)
                );

                const voucherResult = await validateVoucher(tx, {
                    voucherCode: code,
                    userId,
                    subtotal,
                });

                if (!voucherResult) {
                    throwError("VOUCHER_NOT_FOUND", 404);
                }

                const discountAmount = voucherResult.discountAmount;

                const totalAmount = subtotal
                    .sub(discountAmount)
                    .add(SHIPPING_FEE);

                return {
                    valid: true,
                    code: voucherResult.voucher.code,
                    discountType: voucherResult.voucher.discountType,
                    discountValue: Number(
                        voucherResult.voucher.discountValue
                    ),
                    subtotal: Number(subtotal.toFixed(2)),
                    discountAmount: Number(discountAmount.toFixed(2)),
                    shippingFee: Number(SHIPPING_FEE.toFixed(2)),
                    totalAmount: Number(totalAmount.toFixed(2)),
                };
            },
            {
                isolationLevel:
                    Prisma.TransactionIsolationLevel.Serializable,
            }
        );
    } catch (error) {
        handleOrderError(error);
    }
}


// ==========================================
// EXPORTS
// ==========================================


module.exports = {
    createOrder,
    createBuyNowOrder,

    listMyOrders,
    getMyOrderById,
    cancelMyOrder,

    listAdminOrders,
    getAdminOrderById,
    markOrderPaid,
    updateOrderStatus,
    cancelAdminOrder,

    startCheckout,
    expirePendingVnpayOrders,

    previewOrderVoucher,
};

