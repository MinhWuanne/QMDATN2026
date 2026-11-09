
const assert = require("node:assert/strict");
const prisma = require("./core/database/prisma");
const orderService = require("./modules/order/order.service");

const ORDER_ID = "9c8fbe1e-15ab-401b-b048-0c21b8013622";
const USER_ID = "cd0b26c0-f99e-47fd-889d-536a0512d4d2";
const VARIANT_ID = "afbbd525-7038-435a-a600-dfad2f796f35";

async function main() {
    console.log("========== T06: VNPAY EXPIRATION ==========");

    // STEP 1: Kiểm tra đúng đơn test và điều kiện trước khi hết hạn
    const orderBefore = await prisma.order.findUnique({
        where: { id: ORDER_ID },
        include: {
            payment: true,
            items: true,
        },
    });

    assert.ok(orderBefore, "Không tìm thấy đơn test.");
    assert.equal(orderBefore.userId, USER_ID);
    assert.equal(orderBefore.status, "PENDING_CONFIRMATION");
    assert.equal(orderBefore.payment?.method, "VNPAY");
    assert.equal(orderBefore.payment?.status, "PENDING");
    assert.ok(orderBefore.payment.checkoutStartedAt);
    assert.ok(orderBefore.payment.expiresAt);

    const inventoryBefore = await prisma.inventory.findUnique({
        where: { variantId: VARIANT_ID },
    });

    assert.equal(inventoryBefore.quantityOnHand, 8);
    assert.equal(inventoryBefore.reservedQuantity, 4);

    const cartBefore = await prisma.cart.findUnique({
        where: { userId: USER_ID },
        include: { items: true },
    });

    assert.ok(cartBefore);
    assert.equal(cartBefore.items.length, 0);

    console.log("STEP 1: Test order, Payment, Inventory and Cart verified.");

    // STEP 2: Không để lần chạy này ảnh hưởng các đơn test khác
    const otherExpiredPayments = await prisma.payment.findMany({
        where: {
            orderId: { not: ORDER_ID },
            method: "VNPAY",
            status: "PENDING",
            checkoutStartedAt: { not: null },
            expiresAt: { lte: new Date() },
        },
        select: { id: true, orderId: true },
    });

    assert.equal(
        otherExpiredPayments.length,
        0,
        "Có Payment VNPAY khác đã hết hạn. Dừng để tránh xử lý đơn test khác."
    );

    // STEP 3: Mô phỏng hết hạn cho đúng Payment của đơn test
    const expiredAt = new Date(Date.now() - 60 * 1000);

    const updateResult = await prisma.payment.updateMany({
        where: {
            id: orderBefore.payment.id,
            orderId: ORDER_ID,
            method: "VNPAY",
            status: "PENDING",
        },
        data: {
            expiresAt: expiredAt,
        },
    });

    assert.equal(updateResult.count, 1);

    console.log("STEP 2: Checkout expiration moved into the past.");

    // STEP 4: Chạy bộ xử lý hết hạn
    const expirationResult =
        await orderService.expirePendingVnpayOrders();

    console.log("EXPIRATION RESULT:", expirationResult);

    // STEP 5: Kiểm tra Order và Payment
    const orderAfter = await prisma.order.findUnique({
        where: { id: ORDER_ID },
        include: {
            payment: true,
            items: true,
            statusHistory: true,
        },
    });

    assert.equal(orderAfter.status, "CANCELLED");
    assert.equal(orderAfter.payment.status, "CANCELLED");

    const cancellationHistory = orderAfter.statusHistory.find(
        (entry) =>
            entry.newStatus === "CANCELLED" &&
            entry.note === "VNPAY checkout expired after 10 minutes"
    );

    assert.ok(cancellationHistory, "Thiếu lịch sử hủy đơn do hết hạn.");

    console.log("STEP 3: Order and Payment are CANCELLED.");

    // STEP 6: Kiểm tra tồn kho
    const inventoryAfter = await prisma.inventory.findUnique({
        where: { variantId: VARIANT_ID },
    });

    assert.equal(inventoryAfter.quantityOnHand, 8);
    assert.equal(inventoryAfter.reservedQuantity, 2);

    console.log("STEP 4: Reserved inventory released.");

    // STEP 7: Kiểm tra Cart được khôi phục
    const cartAfter = await prisma.cart.findUnique({
        where: { userId: USER_ID },
        include: { items: true },
    });

    assert.ok(cartAfter);

    const restoredItem = cartAfter.items.find(
        (item) => item.variantId === VARIANT_ID
    );

    assert.ok(restoredItem, "Cart chưa khôi phục sản phẩm.");
    assert.equal(restoredItem.quantity, 2);

    console.log("STEP 5: Cart restored.");
    console.log({
        orderStatus: orderAfter.status,
        paymentStatus: orderAfter.payment.status,
        quantityOnHand: inventoryAfter.quantityOnHand,
        reservedQuantity: inventoryAfter.reservedQuantity,
        restoredCartQuantity: restoredItem.quantity,
        cancellationHistory: cancellationHistory.note,
    });

    console.log("\nT06: PASS - VNPAY expiration handled correctly.");
}

main()
    .catch((error) => {
        console.error("\nT06: FAIL");
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
