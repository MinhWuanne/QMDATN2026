
const prisma = require("./core/database/prisma");
const orderService = require("./modules/order/order.service");

async function main() {
    const orderId = "295faa92-5870-4fb0-8bdc-998de8d4cf74";
    const adminId = "490fe9f5-4c9c-49bb-bf0e-fcadb80fcf62";
    const variantId = "afbbd525-7038-435a-a600-dfad2f796f35";

    const before = await prisma.inventory.findUnique({
        where: { variantId },
    });

    const orderBefore = await prisma.order.findUnique({
        where: { id: orderId },
        include: { payment: true },
    });

    console.log("=== BEFORE ADMIN CANCEL ===");
    console.log({
        orderStatus: orderBefore?.status,
        paymentStatus: orderBefore?.payment?.status,
        quantityOnHand: before?.quantityOnHand,
        reservedQuantity: before?.reservedQuantity,
    });

    if (
        !orderBefore ||
        orderBefore.status !== "CONFIRMED" ||
        orderBefore.payment?.status !== "PAID" ||
        before?.quantityOnHand !== 6 ||
        before?.reservedQuantity !== 0
    ) {
        throw new Error("T05 precondition failed. Order or inventory state is unexpected.");
    }

    const result = await orderService.cancelAdminOrder(
        orderId,
        adminId,
        "Test: Admin cancels confirmed order"
    );

    console.log("\n=== CANCEL RESULT ===");
    console.log({
        orderId: result.id,
        orderStatus: result.status,
        paymentStatus: result.payment?.status,
    });

    const after = await prisma.inventory.findUnique({
        where: { variantId },
    });

    const movements = await prisma.inventoryMovement.findMany({
        where: { referenceId: orderId },
        orderBy: { createdAt: "asc" },
    });

    const history = await prisma.orderStatusHistory.findMany({
        where: { orderId },
        orderBy: { createdAt: "asc" },
    });

    console.log("\n=== FINAL VERIFICATION ===");
    console.log({
        quantityOnHand: after.quantityOnHand,
        reservedQuantity: after.reservedQuantity,
        movements: movements.map((movement) => ({
            type: movement.type,
            quantity: movement.quantity,
            beforeStock: movement.beforeStock,
            afterStock: movement.afterStock,
        })),
        history: history.map((entry) => ({
            oldStatus: entry.oldStatus,
            newStatus: entry.newStatus,
            note: entry.note,
        })),
    });

    const hasSale = movements.some(
        (movement) =>
            movement.type === "SALE" &&
            movement.quantity === 2 &&
            movement.beforeStock === 8 &&
            movement.afterStock === 6
    );

    const hasOrderCancel = movements.some(
        (movement) =>
            movement.type === "ORDER_CANCEL" &&
            movement.quantity === 2 &&
            movement.beforeStock === 6 &&
            movement.afterStock === 8
    );

    const hasCancelHistory = history.some(
        (entry) =>
            entry.oldStatus === "CONFIRMED" &&
            entry.newStatus === "CANCELLED"
    );

    if (
        result.status !== "CANCELLED" ||
        result.payment?.status !== "PAID" ||
        after.quantityOnHand !== 8 ||
        after.reservedQuantity !== 0 ||
        movements.length !== 2 ||
        !hasSale ||
        !hasOrderCancel ||
        !hasCancelHistory
    ) {
        throw new Error("T05 verification failed.");
    }

    console.log("\nT05: PASS - Admin cancels confirmed order and restores stock.");
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
