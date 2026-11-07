const prisma = require("./core/database/prisma");

async function main() {
    const userId = "cd0b26c0-f99e-47fd-889d-536a0512d4d2";
    const variantId = "afbbd525-7038-435a-a600-dfad2f796f35";

    const cart = await prisma.cart.findUnique({
        where: { userId },
    });

    if (!cart) {
        throw new Error("Không tìm thấy giỏ hàng.");
    }

    const variant = await prisma.productVariant.findUnique({
        where: { id: variantId },
        include: {
            product: true,
            inventory: true,
        },
    });

    if (!variant || !variant.isActive || variant.product.status !== "ACTIVE") {
        throw new Error("Sản phẩm hoặc biến thể không hoạt động.");
    }

    const available =
        variant.inventory.quantityOnHand -
        variant.inventory.reservedQuantity;

    if (available < 2) {
        throw new Error("Tồn kho khả dụng không đủ.");
    }

    await prisma.cartItem.upsert({
        where: {
            cartId_variantId: {
                cartId: cart.id,
                variantId,
            },
        },
        update: {
            quantity: 2,
        },
        create: {
            cartId: cart.id,
            variantId,
            quantity: 2,
        },
    });

    const result = await prisma.cartItem.findUnique({
        where: {
            cartId_variantId: {
                cartId: cart.id,
                variantId,
            },
        },
    });

    console.log("T03 PREPARATION: PASS");
    console.log("Cart item:", result);
    console.log("Available stock before order:", available);
}

main()
    .catch((error) => {
        console.error("T03 PREPARATION: FAIL");
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });