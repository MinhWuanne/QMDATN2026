const prisma = require("./core/database/prisma");

async function main() {
    const userId = "cd0b26c0-f99e-47fd-889d-536a0512d4d2";
    const variantId = "afbbd525-7038-435a-a600-dfad2f796f35";

    const cart = await prisma.cart.findUnique({
        where: { userId },
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

    const inventory = await prisma.inventory.findUnique({
        where: { variantId },
    });

    console.log("=== CART ===");
    console.dir(cart, { depth: 4 });

    console.log("\n=== INVENTORY ===");
    console.log({
        quantityOnHand: inventory?.quantityOnHand,
        reservedQuantity: inventory?.reservedQuantity,
        available:
            inventory?.quantityOnHand - inventory?.reservedQuantity,
    });
}

main()
    .catch(console.error)
    .finally(async () => prisma.$disconnect());