
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const prisma = require("../lib/prisma");

const {
  issueRegistrationOtp,
  OTP_PURPOSE,
} = require("../services/registration-otp.service");

async function createTestUser() {
  return prisma.user.create({
    data: {
      email: `otp-service-${crypto.randomUUID()}@example.invalid`,
      passwordHash: "integration-test-only",
      fullName: "OTP Service Test",
      role: "CUSTOMER",
      status: "PENDING_VERIFICATION",
    },
  });
}

async function cleanupUser(userId) {
  await prisma.emailVerification.deleteMany({
    where: { userId },
  });

  await prisma.user.delete({
    where: { id: userId },
  });
}

test("Keep OTP valid when email delivery succeeds", async () => {
  let user;

  try {
    user = await createTestUser();

    let capturedEmail;

    const result = await issueRegistrationOtp(user.id, {
      sendEmail: async (email) => {
        capturedEmail = email;
      },
    });

    assert.deepEqual(result, {
      success: true,
      expiresIn: 300,
    });

    assert.equal(capturedEmail.to, user.email);
    assert.equal(capturedEmail.fullName, user.fullName);
    assert.match(capturedEmail.otp, /^\d{6}$/);

    const verification = await prisma.emailVerification.findFirst({
      where: {
        userId: user.id,
        purpose: OTP_PURPOSE,
      },
    });

    assert.ok(verification);
    assert.equal(verification.usedAt, null);
    assert.equal(verification.invalidatedAt, null);
  } finally {
    if (user) {
      await cleanupUser(user.id);
    }
  }
});

test("Invalidate OTP when email delivery fails", async () => {
  let user;

  try {
    user = await createTestUser();

    await assert.rejects(
      () =>
        issueRegistrationOtp(user.id, {
          sendEmail: async () => {
            throw new Error("Simulated email failure");
          },
        }),
      (error) =>
        error.message === "OTP_EMAIL_DELIVERY_FAILED"
    );

    const verification = await prisma.emailVerification.findFirst({
      where: {
        userId: user.id,
        purpose: OTP_PURPOSE,
      },
    });

    assert.ok(verification);
    assert.ok(verification.invalidatedAt);
    assert.equal(verification.usedAt, null);
  } finally {
    if (user) {
      await cleanupUser(user.id);
    }
  }
});
