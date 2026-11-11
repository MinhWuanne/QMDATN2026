/**
 * Customer + Voucher + COD Order Integration Test
 * Run from backend directory:
 * node test-customer-voucher-order-flow.js
 *
 * This test creates a real order, consumes one voucher usage,
 * reserves/deducts stock, and completes the order.
 */

require("dotenv").config();

const assert = require("node:assert/strict");
const { Prisma } = require("@prisma/client");

const prisma = require("./core/database/prisma");
const orderService = require("./modules/order/order.service");

const CUSTOMER_EMAIL =
    (process.env.TEST_CUSTOMER_EMAIL || "liyixo3347@jysnk.com").toLowerCase();

const VOUCHER_CODE =
    (process.env.TEST_VOUCHER_CODE || "").trim().toUpperCase();

const CONFIRM = process.env.CONFIRM_CUSTOMER_ORDER_TEST;

const decimal = (value) => new Prisma.Decimal(value);

function assertMoney(actual, expected, label) {
    assert.ok(
        decimal(actual).equals(decimal(expected)),
        `${label}: expected ${expected}, received ${actual}`
    );
}

function calculateDiscount(voucher, subtotal) {
    let discount;

    if (voucher.discountType === "PERCENTAGE") {
        discount = subtotal.mul(voucher.discountValue).div(100);
    } else {
        discount = decimal(voucher.discountValue);
    }

    if (voucher.maxDiscount !== null) {
        discount = Prisma.Decimal.min(
            discount,
            decimal(voucher.maxDiscount)
        );
    }

    discount = Prisma.Decimal.min(discount, subtotal);

    return discount.toDecimalPlaces(
        2,
        Prisma.Decimal.ROUND_HALF_UP
    );
}

function log(message, data) {
    console.log(`\n[PASS] ${message}`);
    if (data) console.dir(data, { depth: null });
}

async function main() {
    if (CONFIRM !== "YES") {
        throw new Error(
            "Safety stop. Set CONFIRM_CUSTOMER_ORDER_TEST=YES only after confirming the database."
        );
    }

    if (!VOUCHER_CODE) {
        throw new Error("Missing TEST_VOUCHER_CODE.");
    }

    let orderId = null;
    let adminId = null;

    try {
        // 1. Customer
        const customer = await prisma.user.findUnique({
            where: { email: CUSTOMER_EMAIL },
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                status: true,
            },
        });

        assert.ok(customer, "Customer not found.");
        assert.equal(customer.role, "CUSTOMER");
        assert.equal(customer.status, "ACTIVE");

        log("Customer account", {
            email: customer.email,
            name: customer.fullName,
        });

        // 2. Admin actor
        const admin = await prisma.user.findFirst({
            where: {
                role: "ADMIN",
                status: "ACTIVE",
            },
            select: { id: true, email: true },
            orderBy: { createdAt: "asc" },
        });

        assert.ok(admin, "No active ADMIN account found.");
        adminId = admin.id;

        log("Admin actor", { email: admin.email });

        // 3. Customer cart
        const cart = await prisma.cart.findUnique({
            where: { userId: customer.id },
            include: {
                items: {
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

        assert.ok(cart, "Customer cart not found.");
        assert.ok(cart.items.length > 0, "Customer cart is empty.");

        let subtotal = new Prisma.Decimal(0);
        const stockBefore = new Map();

        for (const item of cart.items) {
            const { product, inventory } = item.variant;

            assert.equal(product.status, "ACTIVE");
            assert.equal(item.variant.isActive, true);
            assert.ok(inventory, `Inventory missing: ${item.variant.sku}`);

            const available =
                inventory.quantityOnHand - inventory.reservedQuantity;

            assert.ok(
                available >= item.quantity,
                `Insufficient stock for ${item.variant.sku}`
            );

            const lineTotal = decimal(product.price).mul(item.quantity);
            subtotal = subtotal.add(lineTotal);

            stockBefore.set(item.variantId, {
                sku: item.variant.sku,
                quantity: item.quantity,
                onHand: inventory.quantityOnHand,
                reserved: inventory.reservedQuantity,
            });
        }

        log("Cart and stock", {
            itemCount: cart.items.length,
            subtotal: subtotal.toFixed(2),
        });

        // 4. Voucher validation
        const voucher = await prisma.voucher.findUnique({
            where: { code: VOUCHER_CODE },
        });

        assert.ok(voucher, "Voucher not found.");
        assert.equal(voucher.isActive, true);

        const now = new Date();

        assert.ok(now >= voucher.startsAt && now < voucher.endsAt);
        assert.ok(subtotal.gte(voucher.minOrderAmount));

        const [totalUsage, customerUsage] = await Promise.all([
            prisma.voucherUsage.count({
                where: { voucherId: voucher.id },
            }),
            prisma.voucherUsage.count({
                where: {
                    voucherId: voucher.id,
                    userId: customer.id,
                },
            }),
        ]);

        if (voucher.usageLimit !== null) {
            assert.ok(totalUsage < voucher.usageLimit, "Voucher usage limit reached.");
        }

        assert.ok(
            customerUsage < voucher.perUserLimit,
            "Customer usage limit reached."
        );

        const expectedDiscount = calculateDiscount(voucher, subtotal);

        assert.ok(expectedDiscount.gt(0));

        log("Voucher valid", {
            code: voucher.code,
            discountType: voucher.discountType,
            expectedDiscount: expectedDiscount.toFixed(2),
        });

        // 5. Create COD order
        const order = await orderService.createOrder(customer.id, {
            paymentMethod: "COD",
            voucherCode: VOUCHER_CODE,
            shippingRecipientName: customer.fullName || "Test Customer",
            shippingPhone: "0900000000",
            shippingProvinceCity: "Ha Noi",
            shippingDistrict: "Cau Giay",
            shippingStreet: "Test address - QMDATN2026",
            shippingAddressNote: "Integration test",
            customerNote: "Automated integration test",
        });

        orderId = order.id;

        assert.equal(order.status, "PENDING_CONFIRMATION");
        assert.equal(order.paymentMethod, "COD");
        assert.equal(order.payment.method, "COD");
        assert.equal(order.payment.status, "PENDING");

        assertMoney(order.subtotal, subtotal, "Subtotal");
        assertMoney(order.discountAmount, expectedDiscount, "Discount");

        assertMoney(
            order.totalAmount,
            decimal(order.subtotal)
                .sub(order.discountAmount)
                .add(order.shippingFee),
            "Total amount"
        );

        assert.equal(order.voucher.code, VOUCHER_CODE);
        assert.equal(order.items.length, cart.items.length);

        const usage = await prisma.voucherUsage.findUnique({
            where: { orderId: order.id },
        });

        assert.ok(usage, "Voucher usage was not created.");

        const cartAfterOrder = await prisma.cart.findUnique({
            where: { userId: customer.id },
            include: { items: true },
        });

        assert.equal(cartAfterOrder.items.length, 0);

        for (const item of order.items) {
            const before = stockBefore.get(item.variantId);
            const after = await prisma.inventory.findUnique({
                where: { variantId: item.variantId },
            });

            assert.equal(after.quantityOnHand, before.onHand);
            assert.equal(
                after.reservedQuantity,
                before.reserved + item.quantity
            );
        }

        log("COD order created and voucher applied", {
            orderNumber: order.orderNumber,
            orderId: order.id,
            subtotal: order.subtotal.toString(),
            discount: order.discountAmount.toString(),
            total: order.totalAmount.toString(),
        });

        // 6. Admin order lifecycle
        const transitions = [
            "CONFIRMED",
            "PROCESSING",
            "SHIPPING",
            "DELIVERED",
        ];

        for (const status of transitions) {
            const updated = await orderService.updateOrderStatus(
                order.id,
                status,
                adminId,
                `Integration test: ${status}`
            );

            assert.equal(updated.status, status);
            log(`Order status: ${status}`);

            if (status === "CONFIRMED") {
                for (const item of order.items) {
                    const before = stockBefore.get(item.variantId);
                    const after = await prisma.inventory.findUnique({
                        where: { variantId: item.variantId },
                    });

                    assert.equal(
                        after.quantityOnHand,
                        before.onHand - item.quantity
                    );

                    assert.equal(
                        after.reservedQuantity,
                        before.reserved
                    );
                }

                log("Inventory deducted at confirmation.");
            }
        }

        // 7. COD collection
        const payment = await orderService.markOrderPaid(
            order.id,
            adminId,
            "Integration test: COD collected"
        );

        assert.equal(payment.status, "PAID");
        assertMoney(payment.amount, order.totalAmount, "Payment amount");

        log("COD payment marked PAID");

        // 8. Complete order
        const completed = await orderService.updateOrderStatus(
            order.id,
            "COMPLETED",
            adminId,
            "Integration test: completed"
        );

        assert.equal(completed.status, "COMPLETED");

        // 9. Final verification
        const finalOrder = await prisma.order.findUnique({
            where: { id: order.id },
            include: {
                items: true,
                payment: true,
                statusHistory: {
                    orderBy: { createdAt: "asc" },
                },
                voucherUsage: true,
            },
        });

        assert.equal(finalOrder.status, "COMPLETED");
        assert.equal(finalOrder.payment.status, "PAID");
        assert.ok(finalOrder.voucherUsage);

        const expectedHistory = [
            "PENDING_CONFIRMATION",
            "CONFIRMED",
            "PROCESSING",
            "SHIPPING",
            "DELIVERED",
            "COMPLETED",
        ];

        assert.deepEqual(
            finalOrder.statusHistory.map((entry) => entry.newStatus),
            expectedHistory
        );

        for (const item of finalOrder.items) {
            const before = stockBefore.get(item.variantId);

            const after = await prisma.inventory.findUnique({
                where: { variantId: item.variantId },
            });

            assert.equal(
                after.quantityOnHand,
                before.onHand - item.quantity
            );

            assert.equal(
                after.reservedQuantity,
                before.reserved
            );

            const saleCount = await prisma.inventoryMovement.count({
                where: {
                    referenceId: order.id,
                    variantId: item.variantId,
                    type: "SALE",
                },
            });

            assert.equal(saleCount, 1);
        }

        log("Final order verified", {
            orderNumber: finalOrder.orderNumber,
            status: finalOrder.status,
            payment: finalOrder.payment.status,
            voucher: VOUCHER_CODE,
        });

        console.log("\n========================================");
        console.log("PASS: CUSTOMER + VOUCHER + COD ORDER");
        console.log("Order:", finalOrder.orderNumber);
        console.log("========================================");
        console.log("This order remains in the database.");
        console.log("Stock has been deducted and voucher usage consumed.");

    } catch (error) {
        if (orderId && adminId) {
            try {
                const current = await prisma.order.findUnique({
                    where: { id: orderId },
                    include: { payment: true },
                });

                if (
                    current &&
                    ["PENDING_CONFIRMATION", "CONFIRMED", "PROCESSING", "SHIPPING"].includes(current.status) &&
                    current.payment?.status !== "PAID"
                ) {
                    await orderService.cancelAdminOrder(
                        orderId,
                        adminId,
                        "Integration test cleanup after failure"
                    );

                    console.log("[CLEANUP] Test order cancelled.");
                } else if (current) {
                    console.error(
                        "[CLEANUP REQUIRED] Order needs manual review:",
                        current.id,
                        current.status,
                        current.payment?.status
                    );
                }
            } catch (cleanupError) {
                console.error("[CLEANUP ERROR]", cleanupError.message);
            }
        }

        throw error;
    }
}

main()
    .catch((error) => {
        console.error("\nFAIL: CUSTOMER + VOUCHER + COD ORDER");
        console.error(error.message);
        if (error.details) console.dir(error.details, { depth: null });
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
