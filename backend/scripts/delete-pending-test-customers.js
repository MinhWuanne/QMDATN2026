require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const targetIds = [
    "ba084a0c-1643-4d2e-bf54-449cdcb7abeb",
    "4c50c8e0-0891-451a-b5b9-f95d8c45ecc3",
];

async function main() {
    const result = await prisma.$transaction(async (tx) => {
        const customers = await tx.user.findMany({
            where: {
                id: { in: targetIds },
                role: "CUSTOMER",
                status: "PENDING_VERIFICATION",
            },
            select: { id: true },
        });

        const ids = customers.map((user) => user.id);

        if (ids.length !== 2) {
            throw new Error(
                `Expected 2 pending customers, found ${ids.length}. Aborting.`
            );
        }

        const otpResult = await tx.emailVerification.deleteMany({
            where: { userId: { in: ids } },
        });

        const userResult = await tx.user.deleteMany({
            where: {
                id: { in: ids },
                role: "CUSTOMER",
                status: "PENDING_VERIFICATION",
            },
        });

        if (userResult.count !== 2) {
            throw new Error("Customer deletion count mismatch.");
        }

        return {
            deletedOtpRecords: otpResult.count,
            deletedCustomers: userResult.count,
        };
    });

    console.log("Deletion completed:", result);
}

main()
    .catch((error) => {
        console.error("Deletion failed:", error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });