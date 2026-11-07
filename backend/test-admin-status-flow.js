const prisma = require("./core/database/prisma");
const orderService = require("./modules/order/order.service");

const ORDER_ID = "5cfb4e21-7051-416e-83b5-755326970e58";
const ADMIN_ID = "490fe9f5-4c9c-49bb-bf0e-fcadb80fcf62";

const transitions = ["SHIPPING", "DELIVERED", "COMPLETED"];

async function main() {
    const currentOrder = await prisma.order.findUnique({
        where: { id: ORDER_ID },
        include: { payment: true },
    });

    if (!currentOrder) throw new Error("Không tìm thấy đơn hàng.");

    if (currentOrder.status !== "PROCESSING") {
        throw new Error(
            `Đơn hàng đang ở ${currentOrder.status}, không phải PROCESSING. Dừng kiểm thử.`
        );
    }

    if (currentOrder.payment?.status !== "PAID") {
        throw new Error("Payment chưa PAID. Dừng kiểm thử.");
    }

    console.log("Tiếp tục từ PROCESSING.");

    for (const newStatus of transitions) {
        const result = await orderService.updateOrderStatus(
            ORDER_ID,
            newStatus,
            ADMIN_ID,
            `Kiểm thử chuyển trạng thái sang ${newStatus}`
        );

        console.log(`PASS: ${result.status}`);
    }

    const order = await prisma.order.findUnique({
        where: { id: ORDER_ID },
        include: {
            payment: true,
            statusHistory: true,
        },
    });

    const inventory = await prisma.inventory.findUnique({
        where: {
            variantId: "afbbd525-7038-435a-a600-dfad2f796f35",
        },
    });

    const movements = await prisma.inventoryMovement.findMany({
        where: { referenceId: ORDER_ID },
    });

    console.log("\n========== KẾT QUẢ ==========");
    console.log("Order status:", order.status);
    console.log("Payment status:", order.payment.status);
    console.log("History count:", order.statusHistory.length);
    console.log("Quantity on hand:", inventory.quantityOnHand);
    console.log("Reserved quantity:", inventory.reservedQuantity);
    console.log("Movement count:", movements.length);

    if (
        order.status !== "COMPLETED" ||
        order.payment.status !== "PAID" ||
        order.statusHistory.length !== 6 ||
        inventory.quantityOnHand !== 8 ||
        inventory.reservedQuantity !== 0 ||
        movements.length !== 1 ||
        movements[0].type !== "SALE"
    ) {
        throw new Error("Kết quả kiểm thử không khớp kỳ vọng.");
    }

    console.log("\nT04: PASS - Luồng trạng thái hoàn tất.");
}

main()
    .catch((error) => {
        console.error("\nT04: FAIL");
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });