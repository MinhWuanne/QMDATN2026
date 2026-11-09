
const assert = require("node:assert/strict");
const prisma = require("./core/database/prisma");
const orderService = require("./modules/order/order.service");

const USER_ID = "cd0b26c0-f99e-47fd-889d-536a0512d4d2";
const VARIANT_ID = "afbbd525-7038-435a-a600-dfad2f796f35";
const QUANTITY = 2;

async function main() {
    console.log("========== T05: VNPAY CHECKOUT ==========");

    // STEP 1: Kiểm tra Cart trước khi tạo đơn
    const cart = await prisma.cart.findUnique({
        where: { userId: USER_ID },
        include: { items: true },
    });

    assert.ok(cart, "Không tìm thấy Cart.");
    assert.equal(cart.items.length, 1, "Cart phải có đúng 1 CartItem.");
    assert.equal(cart.items[0].variantId, VARIANT_ID);
    assert.equal(cart.items[0].quantity, QUANTITY);

    const beforeInventory = await prisma.inventory.findUnique({
        where: { variantId: VARIANT_ID },
    });

    assert.ok(beforeInventory, "Không tìm thấy Inventory.");
    assert.ok(
        beforeInventory.quantityOnHand -
            beforeInventory.reservedQuantity >= QUANTITY,
        "Không đủ tồn kho khả dụng."
    );

    console.log("STEP 1: Cart và Inventory hợp lệ.");

    // STEP 2: Tạo đơn VNPAY
    const order = await orderService.createOrder(USER_ID, {
        paymentMethod: "VNPAY",
        shippingRecipientName: "Test VNPAY Customer",
        shippingPhone: "0900000000",
        shippingProvinceCity: "Ha Noi",
        shippingDistrict: "Cau Giay",
        shippingStreet: "Test Street 123",
        shippingAddressNote: "Test VNPAY address",
        customerNote: "Test VNPAY checkout",
    });

    assert.equal(order.status, "PENDING_CONFIRMATION");
    assert.equal(order.payment?.method, "VNPAY");
    assert.equal(order.payment?.status, "PENDING");

    console.log("STEP 2: Order created.");
    console.log({
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderStatus: order.status,
        paymentId: order.payment.id,
        paymentStatus: order.payment.status,
        totalAmount: order.totalAmount.toString(),
    });

    // STEP 3: Khởi tạo phiên checkout
    const checkout = await orderService.startCheckout(
        order.id,
        USER_ID
    );

    assert.equal(checkout.paymentMethod, "VNPAY");
    assert.equal(checkout.paymentStatus, "PENDING");

    const startedAt = new Date(checkout.checkoutStartedAt);
    const expiresAt = new Date(checkout.expiresAt);

    assert.equal(
        expiresAt.getTime() - startedAt.getTime(),
        10 * 60 * 1000,
        "Checkout expiration không đúng 10 phút."
    );

    console.log("STEP 3: Checkout session initialized.");
    console.log({
        checkoutStartedAt: startedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        remainingSeconds: checkout.remainingSeconds,
    });

    // STEP 4: Gọi checkout lần nữa, xác nhận không gia hạn
    const secondCheckout = await orderService.startCheckout(
        order.id,
        USER_ID
    );

    assert.equal(
        new Date(secondCheckout.checkoutStartedAt).getTime(),
        startedAt.getTime(),
        "Checkout start time bị thay đổi."
    );

    assert.equal(
        new Date(secondCheckout.expiresAt).getTime(),
        expiresAt.getTime(),
        "Checkout expiration bị gia hạn ngoài ý muốn."
    );

    console.log("STEP 4: Repeated checkout does not extend expiration.");

    // STEP 5: Kiểm tra Inventory và Cart sau khi tạo đơn
    const afterInventory = await prisma.inventory.findUnique({
        where: { variantId: VARIANT_ID },
    });

    const afterCart = await prisma.cart.findUnique({
        where: { userId: USER_ID },
        include: { items: true },
    });

    assert.equal(
        afterInventory.quantityOnHand,
        beforeInventory.quantityOnHand,
        "quantityOnHand thay đổi ngoài dự kiến."
    );

    assert.equal(
        afterInventory.reservedQuantity,
        beforeInventory.reservedQuantity + QUANTITY,
        "reservedQuantity không tăng đúng."
    );

    assert.equal(afterCart.items.length, 0, "Cart chưa được làm trống.");

    console.log("STEP 5: Inventory and Cart verified.");
    console.log({
        quantityOnHand: afterInventory.quantityOnHand,
        reservedBefore: beforeInventory.reservedQuantity,
        reservedAfter: afterInventory.reservedQuantity,
        remainingCartItems: afterCart.items.length,
    });

    console.log("\nT05: PASS - VNPAY checkout session created.");
    console.log("TEST ORDER ID:", order.id);
}

main()
    .catch((error) => {
        console.error("\nT05: FAIL");
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
