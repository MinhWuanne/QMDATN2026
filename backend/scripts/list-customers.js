require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
    const customers = await prisma.user.findMany({
        where: { role: "CUSTOMER" },
        select: {
            id: true,
            email: true,
            phone: true,
            status: true,
            createdAt: true,
        },
        orderBy: { createdAt: "desc" },
    });

    console.table(customers);
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });