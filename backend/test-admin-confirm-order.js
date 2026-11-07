const prisma = require("./core/database/prisma");
const orderService = require("./modules/order/order.service");

async function main() {
    const orderId = "295faa92-5870-4fb0-8bdc-998de8d4cf74";
    const adminId = "490fe9f5-4c9c-49bb-bf0e-fcadb80fcf62";
    const variantId = "afbbd525-7038-435a-a600-dfad2f796f35";

    console.log("=== STEP 1: MARK COD PAYMENT AS PAID ===");

    const payment = await orderService.markOrderPaid(
        orderId,
        adminId,
        "Test: Admin confirmed COD receipt"
    );

    console.log("PAYMENT RESULT:", {
        id: payment.id,
        method: payment.method,
        status: payment.status,
        amount: payment.amount.toString(),
        paidAt: payment.paidAt,
    });

    console.log("\n=== STEP 2: CONFIRM ORDER ===");

    const order = await orderService.updateOrderStatus(
        orderId,
        "CONFIRMED",
        adminId,
        "Test: Admin confirmed order"
    );

    console.log("ORDER RESULT:", {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.payment?.status,
    });

    console.log("\n=== STEP 3: VERIFY INVENTORY ===");

    const inventory = await prisma.inventory.findUnique({
        where: { variantId },
        select: {
            quantityOnHand: true,
            reservedQuantity: true,
        },
    });

    console.log("INVENTORY:", inventory);

    console.log("\n=== STEP 4: VERIFY INVENTORY MOVEMENTS ===");

    const movements = await prisma.inventoryMovement.findMany({
        where: {
            variantId,
            type: "SALE",
        },
        orderBy: { createdAt: "desc" },
        take: 5,
    });

    console.dir(movements, { depth: null });

    console.log("\n=== STEP 5: VERIFY ORDER HISTORY ===");

    const history = await prisma.orderStatusHistory.findMany({
        where: { orderId },
        orderBy: { createdAt: "asc" },
    });

    console.dir(history, { depth: null });

    console.log("\n=== ADMIN CONFIRMATION TEST COMPLETED ===");
}

main()
    .catch((error) => {
        console.error("\n=== ADMIN TEST FAILED ===");
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });