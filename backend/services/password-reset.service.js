
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { sendEmail } = require("./email.service");
const { hashPassword } = require("../utils/password");
const { getRequiredEnv } = require("../config/env");

const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

function hashResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createResetEmail(resetUrl) {
  return {
    subject: "Reset your QMDATN2026 password",
    text: [
      "We received a request to reset your password.",
      `Reset your password using this link: ${resetUrl}`,
      "This link expires in 15 minutes.",
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: auto;">
        <h2>Password reset</h2>
        <p>We received a request to reset your password.</p>
        <p>
          <a href="${resetUrl}"
             style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">
            Reset password
          </a>
        </p>
        <p>This link expires in 15 minutes.</p>
        <p>If you did not request this, you can safely ignore this email.</p>
      </div>
    `,
  };
}

async function requestPasswordReset(email) {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      status: true,
      emailVerifiedAt: true,
    },
  });

  // Always return the same result to avoid revealing whether an account exists.
  if (
    !user ||
    user.status !== "ACTIVE" ||
    !user.emailVerifiedAt
  ) {
    return { success: true };
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await prisma.$transaction(async (tx) => {
    // Invalidate previous unused reset links.
    await tx.passwordReset.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    await tx.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });
  });

  const frontendUrl = getRequiredEnv("FRONTEND_URL").replace(/\/+$/, "");
  const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
  const emailContent = createResetEmail(resetUrl);

  try {
    await sendEmail({
      to: user.email,
      ...emailContent,
    });
  } catch (error) {
    // Revoke the token if email delivery fails.
    await prisma.passwordReset.updateMany({
      where: {
        tokenHash,
        usedAt: null,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    // Do not expose email delivery errors to the public endpoint.
    console.error("Password reset email delivery failed:", error.message);
  }

  return { success: true };
}

async function resetPassword(token, newPassword) {
  if (
    typeof token !== "string" ||
    !/^[a-f0-9]{64}$/i.test(token)
  ) {
    throw new Error("INVALID_OR_EXPIRED_RESET_TOKEN");
  }

  const tokenHash = hashResetToken(token);
  const now = new Date();
  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction(async (tx) => {
    const resetRecord = await tx.passwordReset.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
        user: {
          status: "ACTIVE",
          emailVerifiedAt: { not: null },
        },
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!resetRecord) {
      throw new Error("INVALID_OR_EXPIRED_RESET_TOKEN");
    }

    // Atomically claim the token to prevent reuse or concurrent resets.
    const claimed = await tx.passwordReset.updateMany({
      where: {
        id: resetRecord.id,
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        usedAt: now,
      },
    });

    if (claimed.count !== 1) {
      throw new Error("INVALID_OR_EXPIRED_RESET_TOKEN");
    }

    await tx.user.update({
      where: { id: resetRecord.userId },
      data: { passwordHash },
    });

    // Force the user to sign in again on every device.
    await tx.refreshToken.updateMany({
      where: {
        userId: resetRecord.userId,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    });

    // Invalidate all other outstanding reset links.
    await tx.passwordReset.updateMany({
      where: {
        userId: resetRecord.userId,
        id: { not: resetRecord.id },
        usedAt: null,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    });
  });

  return { success: true };
}

module.exports = {
  requestPasswordReset,
  resetPassword,
};
