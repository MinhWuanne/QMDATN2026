
const prisma = require("../lib/prisma");

const {
  generateOtp,
  hashOtp,
  verifyOtp,
} = require("../utils/otp");

const { getSecret } = require("../config/env");

const {
  sendRegistrationOtpEmail,
} = require("./registration-email.service");

const OTP_PURPOSE = "REGISTER";
const OTP_EXPIRY_MINUTES = 5;
const OTP_RESEND_INTERVAL_SECONDS = 60;
const OTP_MAX_SENDS_PER_HOUR = 5;
const OTP_MAX_ATTEMPTS = 5;

function getOtpHashSecret() {
  return getSecret("OTP_HASH_SECRET");
}

async function createRegistrationOtp(userId) {
  const secret = getOtpHashSecret();
  const otp = generateOtp();

  const tokenHash = hashOtp(
    {
      userId,
      purpose: OTP_PURPOSE,
      code: otp,
    },
    secret
  );

  const now = new Date();
  const oneHourAgo = new Date(
    now.getTime() - 60 * 60 * 1000
  );

  const resendIntervalMs =
    OTP_RESEND_INTERVAL_SECONDS * 1000;

  return prisma.$transaction(async (tx) => {
    // Serialize OTP creation requests for the same user.
    await tx.$queryRaw`
  SELECT 1 AS lock_acquired
  FROM (
    SELECT pg_advisory_xact_lock(hashtext(${userId}))
  ) AS lock_result
`;

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        status: true,
        emailVerifiedAt: true,
      },
    });

    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    if (
      user.status !== "PENDING_VERIFICATION" ||
      user.emailVerifiedAt
    ) {
      throw new Error("USER_NOT_ELIGIBLE_FOR_VERIFICATION");
    }

    const recentSendCount =
      await tx.emailVerification.count({
        where: {
          userId,
          purpose: OTP_PURPOSE,
          createdAt: {
            gte: oneHourAgo,
          },
        },
      });

    if (recentSendCount >= OTP_MAX_SENDS_PER_HOUR) {
      throw new Error("OTP_SEND_LIMIT_EXCEEDED");
    }

    const latestOtp = await tx.emailVerification.findFirst({
      where: {
        userId,
        purpose: OTP_PURPOSE,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        createdAt: true,
      },
    });

    if (
      latestOtp &&
      now.getTime() - latestOtp.createdAt.getTime() <
      resendIntervalMs
    ) {
      throw new Error("OTP_RESEND_TOO_SOON");
    }

    // Invalidate every previous unused OTP.
    await tx.emailVerification.updateMany({
      where: {
        userId,
        purpose: OTP_PURPOSE,
        usedAt: null,
        invalidatedAt: null,
      },
      data: {
        invalidatedAt: now,
      },
    });

    const verification = await tx.emailVerification.create({
      data: {
        userId,
        purpose: OTP_PURPOSE,
        tokenHash,
        expiresAt: new Date(
          now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000
        ),
      },
    });

    return {
      verificationId: verification.id,
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      otp,
    };
  });
}

async function verifyRegistrationOtp(userId, code) {
  const secret = getOtpHashSecret();
  const now = new Date();

  const outcome = await prisma.$transaction(async (tx) => {
    // Serialize verification requests for the same user.
    await tx.$queryRaw`
      SELECT 1 AS lock_acquired
      FROM (
        SELECT pg_advisory_xact_lock(hashtext(${userId}))
      ) AS lock_result
    `;

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        emailVerifiedAt: true,
      },
    });

    if (
      !user ||
      user.status !== "PENDING_VERIFICATION" ||
      user.emailVerifiedAt
    ) {
      return { error: "OTP_INVALID_OR_UNAVAILABLE" };
    }

    const verification = await tx.emailVerification.findFirst({
      where: {
        userId,
        purpose: OTP_PURPOSE,
        usedAt: null,
        invalidatedAt: null,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!verification) {
      return { error: "OTP_INVALID_OR_UNAVAILABLE" };
    }

    if (verification.expiresAt <= now) {
      await tx.emailVerification.update({
        where: { id: verification.id },
        data: { invalidatedAt: now },
      });

      return { error: "OTP_EXPIRED" };
    }

    const isValid = verifyOtp(
      {
        userId,
        purpose: OTP_PURPOSE,
        code,
        storedHash: verification.tokenHash,
      },
      secret
    );

    if (!isValid) {
      const nextAttemptCount = verification.attemptCount + 1;
      const shouldInvalidate =
        nextAttemptCount >= OTP_MAX_ATTEMPTS;

      await tx.emailVerification.update({
        where: { id: verification.id },
        data: {
          attemptCount: nextAttemptCount,
          ...(shouldInvalidate
            ? { invalidatedAt: now }
            : {}),
        },
      });

      return {
        error: shouldInvalidate
          ? "OTP_MAX_ATTEMPTS_EXCEEDED"
          : "OTP_INVALID",
      };
    }

    await tx.emailVerification.update({
      where: { id: verification.id },
      data: { usedAt: now },
    });

    await tx.user.update({
      where: { id: userId },
      data: {
        status: "ACTIVE",
        emailVerifiedAt: now,
      },
    });

    return {
      success: true,
      verifiedAt: now,
    };
  });

  if (outcome.error) {
    throw new Error(outcome.error);
  }

  return outcome;
}

async function issueRegistrationOtp(
  userId,
  {
    sendEmail = sendRegistrationOtpEmail,
  } = {}
) {
  const result = await createRegistrationOtp(userId);

  try {
    await sendEmail({
      to: result.email,
      fullName: result.fullName,
      otp: result.otp,
    });
  } catch (error) {
    // Email delivery failed: invalidate the OTP.
    try {
      await prisma.emailVerification.updateMany({
        where: {
          id: result.verificationId,
          usedAt: null,
          invalidatedAt: null,
        },
        data: {
          invalidatedAt: new Date(),
        },
      });
    } catch (cleanupError) {
      console.error(
        "Failed to invalidate undelivered OTP:",
        cleanupError.message
      );
    }

    const deliveryError = new Error(
      "OTP_EMAIL_DELIVERY_FAILED"
    );
    deliveryError.cause = error;

    throw deliveryError;
  }

  return {
    success: true,
    expiresIn: 300,
  };
}


module.exports = {
  OTP_PURPOSE,
  OTP_EXPIRY_MINUTES,
  OTP_RESEND_INTERVAL_SECONDS,
  OTP_MAX_SENDS_PER_HOUR,
  OTP_MAX_ATTEMPTS,
  generateOtp,
  hashOtp,
  verifyOtp,
  getOtpHashSecret,
  createRegistrationOtp,
  issueRegistrationOtp,
  sendRegistrationOtpEmail,
  prisma,
  verifyRegistrationOtp,
};
