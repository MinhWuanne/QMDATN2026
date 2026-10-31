require("dotenv").config();

const prisma = require("../lib/prisma");
const { hashPassword } = require("../utils/password");

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const fullName = process.env.ADMIN_FULL_NAME || "System Admin";

  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required");
  }

  if (password.length < 8) {
    throw new Error("Admin password must be at least 8 characters");
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser && existingUser.role !== "ADMIN") {
    throw new Error("This email already belongs to a non-admin user");
  }

  const passwordHash = await hashPassword(password);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      fullName,
      role: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: existingUser?.emailVerifiedAt || new Date(),
    },
    create: {
      email,
      passwordHash,
      fullName,
      role: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
    },
  });

  console.log("Admin seed completed:", admin);
}

main()
  .catch((error) => {
    console.error("Admin seed failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });