const prisma = require("./core/database/prisma");
const orderService = require("./modules/order/order.service");

async function main() {
    const userId = "cd0b26c0-f99e-47fd-889d-536a0512d4d2";
    const variantId = "afbbd525-7038-435a-a600-dfad2f796f35";

    console.log("=== CREATING COD ORDER ===");

    const order = await orderService.createOrder(userId, {
        paymentMethod: "COD",
        shippingRecipientName: "Test Customer",
        shippingPhone: "0900000000",
        shippingProvinceCity: "Ha Noi",
        shippingDistrict: "Cau Giay",
        shippingStreet: "Test Street 123",
        shippingAddressNote: "Test address",
        customerNote: "Test COD order",
    });

    console.log("\n=== ORDER RESULT ===");
    console.dir({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentMethod: order.paymentMethod,
        subtotal: order.subtotal.toString(),
        discountAmount: order.discountAmount.toString(),
        shippingFee: order.shippingFee.toString(),
        totalAmount: order.totalAmount.toString(),
        payment: order.payment
            ? {
                  method: order.payment.method,
                  status: order.payment.status,
                  amount: order.payment.amount.toString(),
              }
            : null,
        items: order.items.map((item) => ({
            productName: item.productName,
            variantName: item.variantName,
            sku: item.sku,
            quantity: item.quantity,
            unitPrice: item.unitPrice.toString(),
            lineTotal: item.lineTotal.toString(),
        })),
        statusHistory: order.statusHistory,
    }, { depth: null });

    const inventory = await prisma.inventory.findUnique({
        where: { variantId },
        select: {
            quantityOnHand: true,
            reservedQuantity: true,
        },
    });

    const cart = await prisma.cart.findUnique({
        where: { userId },
        include: {
            items: true,
        },
    });

    console.log("\n=== INVENTORY AFTER ORDER ===");
    console.log(inventory);

    console.log("\n=== CART AFTER ORDER ===");
    console.log({
        remainingCartItems: cart?.items.length ?? 0,
    });
}

main()
    .catch((error) => {
        console.error("\n=== TEST FAILED ===");
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });