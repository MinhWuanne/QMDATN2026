const prisma = require("./core/database/prisma");

async function main() {
    const userId = "cd0b26c0-f99e-47fd-889d-536a0512d4d2";
    const variantId = "afbbd525-7038-435a-a600-dfad2f796f35";

    await prisma.$transaction(async (tx) => {
        const cart = await tx.cart.upsert({
            where: { userId },
            update: {},
            create: { userId },
        });

        const cartItem = await tx.cartItem.upsert({
            where: {
                cartId_variantId: {
                    cartId: cart.id,
                    variantId,
                },
            },
            update: { quantity: 2 },
            create: {
                cartId: cart.id,
                variantId,
                quantity: 2,
            },
        });

        console.log("TEST CART:", {
            cartId: cart.id,
            userId,
            variantId,
            quantity: cartItem.quantity,
        });
    });
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });