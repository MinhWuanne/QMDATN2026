const prisma = require("./core/database/prisma");

async function main() {
    const admins = await prisma.user.findMany({
        where: {
            role: "ADMIN",
            status: "ACTIVE",
        },
        select: {
            id: true,
            role: true,
        },
    });

    console.log("ACTIVE ADMINS:");
    console.log(admins);
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });