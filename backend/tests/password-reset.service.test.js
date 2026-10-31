const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const prisma = require("../lib/prisma");
const { hashPassword, verifyPassword } = require("../utils/password");
const emailService = require("../services/email.service");
const { createRefreshSession } = require("../services/refresh-token.service");

// Mock email: không gửi email thật trong quá trình test.
let sendEmailHandler = async () => {};

emailService.sendEmail = (...args) => sendEmailHandler(...args);

const {
  requestPasswordReset,
  resetPassword,
} = require("../services/password-reset.service");

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function extractToken(email) {
  const match = email.html.match(/href="([^"]+)"/);
  assert.ok(match, "Reset link must exist in email");

  return new URL(match[1]).searchParams.get("token");
}

async function createTestUser() {
  return prisma.user.create({
    data: {
      fullName: "Password Reset Test",
      email: `reset-${crypto.randomUUID()}@example.invalid`,
      passwordHash: await hashPassword("OldPassword123"),
      role: "CUSTOMER",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
}

async function cleanupUser(userId) {
  await prisma.passwordReset.deleteMany({
    where: { userId },
  });

  await prisma.refreshToken.deleteMany({
    where: { userId },
  });

  await prisma.user.delete({
    where: { id: userId },
  });
}

test("Forgot password returns success for non-existing account", async () => {
  let emailSent = false;

  sendEmailHandler = async () => {
    emailSent = true;
  };

  const result = await requestPasswordReset(
    `missing-${crypto.randomUUID()}@example.invalid`
  );

  assert.equal(result.success, true);
  assert.equal(emailSent, false);
});

test("Request password reset successfully and store only token hash", async () => {
  let user;
  let sentEmail;

  try {
    user = await createTestUser();

    sendEmailHandler = async (email) => {
      sentEmail = email;
    };

    const result = await requestPasswordReset(user.email);

    assert.equal(result.success, true);
    assert.ok(sentEmail);
    assert.equal(sentEmail.to, user.email);

    const rawToken = extractToken(sentEmail);

    assert.match(rawToken, /^[a-f0-9]{64}$/);

    const resetRecord = await prisma.passwordReset.findFirst({
      where: { userId: user.id },
    });

    assert.ok(resetRecord);
    assert.equal(resetRecord.tokenHash, hashToken(rawToken));
    assert.notEqual(resetRecord.tokenHash, rawToken);
    assert.equal(resetRecord.usedAt, null);
    assert.equal(resetRecord.revokedAt, null);

    const remainingTime =
      resetRecord.expiresAt.getTime() - Date.now();

    assert.ok(remainingTime > 0);
    assert.ok(remainingTime <= 15 * 60 * 1000);

    assert.match(sentEmail.html, /Reset password/);
    assert.match(sentEmail.text, /15 minutes/);
  } finally {
    if (user) await cleanupUser(user.id);
  }
});

test("New password reset request revokes previous reset link", async () => {
  let user;
  const sentEmails = [];

  try {
    user = await createTestUser();

    sendEmailHandler = async (email) => {
      sentEmails.push(email);
    };

    await requestPasswordReset(user.email);
    await requestPasswordReset(user.email);

    assert.equal(sentEmails.length, 2);

    const records = await prisma.passwordReset.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });

    assert.equal(records.length, 2);
    assert.ok(records[0].revokedAt);
    assert.equal(records[0].usedAt, null);

    assert.equal(records[1].revokedAt, null);
    assert.equal(records[1].usedAt, null);
  } finally {
    if (user) await cleanupUser(user.id);
  }
});

test("Revoke reset token when email delivery fails", async () => {
  let user;

  try {
    user = await createTestUser();

    sendEmailHandler = async () => {
      throw new Error("Simulated email delivery failure");
    };

    const originalError = console.error;
    console.error = () => {};

    try {
      const result = await requestPasswordReset(user.email);
      assert.equal(result.success, true);
    } finally {
      console.error = originalError;
    }

    const resetRecord = await prisma.passwordReset.findFirst({
      where: { userId: user.id },
    });

    assert.ok(resetRecord);
    assert.ok(resetRecord.revokedAt);
  } finally {
    if (user) await cleanupUser(user.id);
  }
});

test("Reset password successfully and revoke all refresh sessions", async () => {
  let user;

  try {
    user = await createTestUser();

    sendEmailHandler = async (email) => {
      globalThis.__passwordResetTestEmail = email;
    };

    await requestPasswordReset(user.email);

    const rawToken = extractToken(
      globalThis.__passwordResetTestEmail
    );

    delete globalThis.__passwordResetTestEmail;

    const session1 = await createRefreshSession({
      userId: user.id,
    });

    const session2 = await createRefreshSession({
      userId: user.id,
    });

    const result = await resetPassword(
      rawToken,
      "NewPassword123"
    );

    assert.equal(result.success, true);

    const updatedUser = await prisma.user.findUnique({
      where: { id: user.id },
    });

    assert.equal(
      await verifyPassword(
        updatedUser.passwordHash,
        "NewPassword123"
      ),
      true
    );

    assert.equal(
      await verifyPassword(
        updatedUser.passwordHash,
        "OldPassword123"
      ),
      false
    );

    const resetRecord = await prisma.passwordReset.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });

    assert.ok(resetRecord.usedAt);

    const sessions = await prisma.refreshToken.findMany({
      where: { userId: user.id },
    });

    assert.equal(sessions.length, 2);
    assert.ok(sessions.every((session) => session.revokedAt));

    assert.ok(session1.refreshToken);
    assert.ok(session2.refreshToken);
  } finally {
    if (user) await cleanupUser(user.id);
  }
});

test("Reject malformed password reset token", async () => {
  await assert.rejects(
    () => resetPassword("invalid-token", "NewPassword123"),
    (error) =>
      error.message === "INVALID_OR_EXPIRED_RESET_TOKEN"
  );
});

test("Reject expired password reset token", async () => {
  let user;

  try {
    user = await createTestUser();

    const rawToken = crypto.randomBytes(32).toString("hex");

    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() - 60 * 1000),
      },
    });

    await assert.rejects(
      () => resetPassword(rawToken, "NewPassword123"),
      (error) =>
        error.message === "INVALID_OR_EXPIRED_RESET_TOKEN"
    );
  } finally {
    if (user) await cleanupUser(user.id);
  }
});

test("Reject reuse of an already used reset token", async () => {
  let user;
  let rawToken;

  try {
    user = await createTestUser();

    sendEmailHandler = async (email) => {
      globalThis.__passwordResetTestEmail = email;
    };

    await requestPasswordReset(user.email);

    rawToken = extractToken(globalThis.__passwordResetTestEmail);
    delete globalThis.__passwordResetTestEmail;

    await resetPassword(rawToken, "NewPassword123");

    await assert.rejects(
      () => resetPassword(rawToken, "AnotherPassword123"),
      (error) =>
        error.message === "INVALID_OR_EXPIRED_RESET_TOKEN"
    );
  } finally {
    if (user) await cleanupUser(user.id);
  }
});

test("Only one concurrent request can use the same reset token", async () => {
  let user;

  try {
    user = await createTestUser();

    let sentEmail;

    sendEmailHandler = async (email) => {
      sentEmail = email;
    };

    await requestPasswordReset(user.email);

    const rawToken = extractToken(sentEmail);

    const results = await Promise.allSettled([
      resetPassword(rawToken, "ConcurrentPassword123"),
      resetPassword(rawToken, "AnotherPassword123"),
    ]);

    const successful = results.filter(
      (result) => result.status === "fulfilled"
    );

    const failed = results.filter(
      (result) => result.status === "rejected"
    );

    assert.equal(successful.length, 1);
    assert.equal(failed.length, 1);

    assert.equal(
      failed[0].reason.message,
      "INVALID_OR_EXPIRED_RESET_TOKEN"
    );

    const updatedUser = await prisma.user.findUnique({
      where: { id: user.id },
    });

    const passwordIsFirstValid = await verifyPassword(
      updatedUser.passwordHash,
      "ConcurrentPassword123"
    );

    const passwordIsSecondValid = await verifyPassword(
      updatedUser.passwordHash,
      "AnotherPassword123"
    );

    assert.equal(
      passwordIsFirstValid || passwordIsSecondValid,
      true
    );

    assert.equal(
      passwordIsFirstValid && passwordIsSecondValid,
      false
    );
  } finally {
    if (user) await cleanupUser(user.id);
  }
});