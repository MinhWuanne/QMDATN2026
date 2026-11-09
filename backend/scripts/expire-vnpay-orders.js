
const orderService = require("../modules/order/order.service");
const prisma = require("../core/database/prisma");

async function main() {
    console.log("[VNPAY EXPIRY] Job started");

    const result = await orderService.expirePendingVnpayOrders();

    console.log("[VNPAY EXPIRY] Job completed", {
        scanned: result.scanned,
        expired: result.expired,
    });
}

main()
    .catch((error) => {
        console.error("[VNPAY EXPIRY] Job failed:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
