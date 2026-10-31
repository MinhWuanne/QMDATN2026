
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const prisma = require("../lib/prisma");

const {
  createRegistrationOtp,
  verifyRegistrationOtp,
  OTP_PURPOSE,
  OTP_MAX_ATTEMPTS,
} = require("../services/registration-otp.service");

async function createTestUser() {
  return prisma.user.create({
    data: {
      email: `otp-verify-${crypto.randomUUID()}@example.invalid`,
      passwordHash: "integration-test-only",
      fullName: "OTP Verification Test",
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

test("Activate account when OTP is correct", async () => {
  let user;

  try {
    user = await createTestUser();

    const otp = await createRegistrationOtp(user.id);

    const result = await verifyRegistrationOtp(
      user.id,
      otp.otp
    );

    assert.equal(result.success, true);

    const updatedUser = await prisma.user.findUnique({
      where: { id: user.id },
    });

    const verification = await prisma.emailVerification.findUnique({
      where: { id: otp.verificationId },
    });

    assert.equal(updatedUser.status, "ACTIVE");
    assert.ok(updatedUser.emailVerifiedAt);
    assert.ok(verification.usedAt);
    assert.equal(verification.invalidatedAt, null);
  } finally {
    if (user) await cleanupUser(user.id);
  }
});

test("Increase attempt count when OTP is incorrect", async () => {
  let user;

  try {
    user = await createTestUser();

    const otp = await createRegistrationOtp(user.id);

    await assert.rejects(
      () => verifyRegistrationOtp(user.id, "000000"),
      (error) => error.message === "OTP_INVALID"
    );

    const verification = await prisma.emailVerification.findUnique({
      where: { id: otp.verificationId },
    });

    assert.equal(verification.attemptCount, 1);
    assert.equal(verification.invalidatedAt, null);
  } finally {
    if (user) await cleanupUser(user.id);
  }
});

test("Invalidate OTP after maximum failed attempts", async () => {
  let user;

  try {
    user = await createTestUser();

    const otp = await createRegistrationOtp(user.id);

    for (let i = 1; i < OTP_MAX_ATTEMPTS; i++) {
      await assert.rejects(
        () => verifyRegistrationOtp(user.id, "000000"),
        (error) => error.message === "OTP_INVALID"
      );
    }

    await assert.rejects(
      () => verifyRegistrationOtp(user.id, "000000"),
      (error) =>
        error.message === "OTP_MAX_ATTEMPTS_EXCEEDED"
    );

    const verification = await prisma.emailVerification.findUnique({
      where: { id: otp.verificationId },
    });

    assert.equal(
      verification.attemptCount,
      OTP_MAX_ATTEMPTS
    );

    assert.ok(verification.invalidatedAt);
  } finally {
    if (user) await cleanupUser(user.id);
  }
});

test("Reject and invalidate expired OTP", async () => {
  let user;

  try {
    user = await createTestUser();

    const otp = await createRegistrationOtp(user.id);

    await prisma.emailVerification.update({
      where: { id: otp.verificationId },
      data: {
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    await assert.rejects(
      () => verifyRegistrationOtp(user.id, otp.otp),
      (error) => error.message === "OTP_EXPIRED"
    );

    const verification = await prisma.emailVerification.findUnique({
      where: { id: otp.verificationId },
    });

    assert.ok(verification.invalidatedAt);
  } finally {
    if (user) await cleanupUser(user.id);
  }
});

test("Reject OTP reuse after successful verification", async () => {
  let user;

  try {
    user = await createTestUser();

    const otp = await createRegistrationOtp(user.id);

    await verifyRegistrationOtp(user.id, otp.otp);

    await assert.rejects(
      () => verifyRegistrationOtp(user.id, otp.otp),
      (error) =>
        error.message === "OTP_INVALID_OR_UNAVAILABLE"
    );
  } finally {
    if (user) await cleanupUser(user.id);
  }
});


test("Reject verification when user is not pending verification", async () => {
  let user;

  try {
    user = await createTestUser();

    // Complete email verification before locking the account.
    await prisma.user.update({
      where: { id: user.id },
      data: {
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        status: "LOCKED",
      },
    });

    await assert.rejects(
      () => verifyRegistrationOtp(user.id, "123456"),
      (error) =>
        error.message === "OTP_INVALID_OR_UNAVAILABLE"
    );
  } finally {
    if (user) await cleanupUser(user.id);
  }
});


test("Only one concurrent request can verify the same OTP", async () => {
  let user;

  try {
    user = await createTestUser();

    const otp = await createRegistrationOtp(user.id);

    const results = await Promise.allSettled([
      verifyRegistrationOtp(user.id, otp.otp),
      verifyRegistrationOtp(user.id, otp.otp),
    ]);

    const successfulResults = results.filter(
      (result) => result.status === "fulfilled"
    );

    const failedResults = results.filter(
      (result) => result.status === "rejected"
    );

    assert.equal(successfulResults.length, 1);
    assert.equal(failedResults.length, 1);

    assert.equal(
      failedResults[0].reason.message,
      "OTP_INVALID_OR_UNAVAILABLE"
    );

    const updatedUser = await prisma.user.findUnique({
      where: { id: user.id },
    });

    const verification = await prisma.emailVerification.findUnique({
      where: { id: otp.verificationId },
    });

    assert.equal(updatedUser.status, "ACTIVE");
    assert.ok(updatedUser.emailVerifiedAt);
    assert.ok(verification.usedAt);
  } finally {
    if (user) await cleanupUser(user.id);
  }
});
