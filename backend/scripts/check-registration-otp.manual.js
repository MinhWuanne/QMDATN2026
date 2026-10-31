
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const prisma = require("../lib/prisma");

const {
  createRegistrationOtp,
  verifyOtp,
  getOtpHashSecret,
  OTP_PURPOSE,
} = require("../services/registration-otp.service");

async function main() {
  let testUserId;

  try {
    console.log("Creating temporary test user...");

    const user = await prisma.user.create({
      data: {
        email: `otp-test-${crypto.randomUUID()}@example.invalid`,
        passwordHash: "integration-test-only",
        fullName: "OTP Integration Test",
        role: "CUSTOMER",
        status: "PENDING_VERIFICATION",
      },
    });

    testUserId = user.id;

    console.log("Test user created.");

    console.log("Creating registration OTP...");

    const result = await createRegistrationOtp(testUserId);

    assert.match(result.otp, /^\d{6}$/);
    assert.equal(result.userId, testUserId);

    console.log("OTP generated successfully.");

    const verification = await prisma.emailVerification.findUnique({
      where: {
        id: result.verificationId,
      },
    });

    assert.ok(verification);
    assert.notEqual(verification.tokenHash, result.otp);

    assert.equal(
      verifyOtp(
        {
          userId: testUserId,
          purpose: OTP_PURPOSE,
          code: result.otp,
          storedHash: verification.tokenHash,
        },
        getOtpHashSecret()
      ),
      true
    );

    console.log("OTP hash stored and verified successfully.");

    await assert.rejects(
      () => createRegistrationOtp(testUserId),
      (error) => error.message === "OTP_RESEND_TOO_SOON"
    );

    console.log("60-second resend restriction verified.");

    console.log("\nAll registration OTP integration checks passed!");
  } catch (error) {
    console.error("\nIntegration test failed:", error.message);
    process.exitCode = 1;
  } finally {
    if (testUserId) {
      await prisma.emailVerification.deleteMany({
        where: { userId: testUserId },
      });

      await prisma.user.delete({
        where: { id: testUserId },
      });

      console.log("Temporary test data cleaned up.");
    }

    await prisma.$disconnect();
  }
}

main();
