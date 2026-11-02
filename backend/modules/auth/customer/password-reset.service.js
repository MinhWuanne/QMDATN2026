const crypto = require("crypto");
const prisma = require("../../../core/database/prisma");
const { sendEmail } = require("../../../core/email/email.service");
const { hashPassword } = require("../../../core/security/password");
const { getRequiredEnv } = require("../../../core/config/env");

const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const RESET_WINDOW_MS = 24 * 60 * 60 * 1000;
const RESET_MAX_REQUESTS = 3;

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
      role: true,
      status: true,
      emailVerifiedAt: true,
    },
  });

  if (
    !user ||
    user.role !== "CUSTOMER" ||
    user.status !== "ACTIVE" ||
    !user.emailVerifiedAt
  ) {
    return { success: true };
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - RESET_WINDOW_MS);

  const resetRequest = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT 1 AS lock_acquired
      FROM (
        SELECT pg_advisory_xact_lock(hashtext(${user.id}))
      ) AS lock_result
    `;

    const lockedUser = await tx.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        passwordResetBlockedUntil: true,
      },
    });

    if (!lockedUser) {
      return { allowed: false };
    }

    let effectiveWindowStart = windowStart;

    if (lockedUser.passwordResetBlockedUntil) {
      if (lockedUser.passwordResetBlockedUntil > now) {
        return { allowed: false };
      }

      // Khóa đã hết hạn: dùng thời điểm hết khóa làm mốc cho chu kỳ mới.
      // Giữ nguyên mốc này để các lần yêu cầu tiếp theo vẫn dùng cùng cửa sổ.
      effectiveWindowStart = lockedUser.passwordResetBlockedUntil;
    }

    const requestCount = await tx.passwordReset.count({
      where: {
        userId: user.id,
        createdAt: { gte: effectiveWindowStart },
      },
    });

    if (requestCount >= RESET_MAX_REQUESTS) {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordResetBlockedUntil: new Date(
            now.getTime() + RESET_WINDOW_MS
          ),
        },
      });

      return { allowed: false };
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashResetToken(rawToken);
    const expiresAt = new Date(now.getTime() + RESET_TOKEN_TTL_MS);

    await tx.passwordReset.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    });

    await tx.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        createdAt: now,
      },
    });

    return {
      allowed: true,
      rawToken,
      tokenHash,
    };
  });

  if (!resetRequest.allowed) {
    return { success: true };
  }

  const frontendUrl = getRequiredEnv("FRONTEND_URL").replace(/\/+$/, "");
  const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(resetRequest.rawToken)}`;
  const emailContent = createResetEmail(resetUrl);

  try {
    await sendEmail({
      to: user.email,
      ...emailContent,
    });
  } catch (error) {
    await prisma.passwordReset.updateMany({
      where: {
        tokenHash: resetRequest.tokenHash,
        usedAt: null,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

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
          role: "CUSTOMER",
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

    await tx.refreshToken.updateMany({
      where: {
        userId: resetRecord.userId,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    });

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
