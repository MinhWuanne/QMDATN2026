
const crypto = require("node:crypto");

const prisma = require("../lib/prisma");

const {
    generateRefreshToken,
    hashRefreshToken,
} = require("../utils/refresh-token");

const REFRESH_TOKEN_TTL_DAYS = 30;

const ALLOWED_ROLES = ["CUSTOMER", "ADMIN"];

function getRefreshTokenExpiry(now = new Date()) {
    const expiresAt = new Date(now);

    expiresAt.setDate(
        expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS
    );

    return expiresAt;
}

function normalizeDeviceName(deviceName) {
    if (typeof deviceName !== "string") {
        return null;
    }

    const normalized = deviceName.trim();

    return normalized
        ? normalized.slice(0, 255)
        : null;
}

function normalizeUserAgent(userAgent) {
    if (typeof userAgent !== "string") {
        return null;
    }

    const normalized = userAgent.trim();

    return normalized
        ? normalized.slice(0, 1000)
        : null;
}

async function createRefreshSession({
    userId,
    deviceName,
    userAgent,
}) {
    if (typeof userId !== "string" || !userId.trim()) {
        throw new Error("INVALID_USER_ID");
    }

    const now = new Date();
    const refreshToken = generateRefreshToken();
    const tokenHash = hashRefreshToken(refreshToken);
    const familyId = crypto.randomUUID();
    const expiresAt = getRefreshTokenExpiry(now);

    const session = await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                role: true,
                status: true,
            },
        });

        if (!user || user.status !== "ACTIVE") {
            throw new Error("ACCOUNT_NOT_ACTIVE");
        }

        if (!ALLOWED_ROLES.includes(user.role)) {
            throw new Error("INVALID_USER_ROLE");
        }

        return tx.refreshToken.create({
            data: {
                userId: user.id,
                familyId,
                tokenHash,
                deviceName: normalizeDeviceName(deviceName),
                userAgent: normalizeUserAgent(userAgent),
                expiresAt,
            },
            select: {
                id: true,
                familyId: true,
                expiresAt: true,
                createdAt: true,
            },
        });
    });

    return {
        refreshToken,
        expiresAt: session.expiresAt,
        sessionId: session.id,
    };
}

async function rotateRefreshToken(rawToken) {
    const oldTokenHash = hashRefreshToken(rawToken);

    const newRawToken = generateRefreshToken();
    const newTokenHash = hashRefreshToken(newRawToken);

    const now = new Date();
    const newExpiresAt = getRefreshTokenExpiry(now);

    const outcome = await prisma.$transaction(async (tx) => {
        // Serialize requests sử dụng cùng một Refresh Token.
        await tx.$queryRaw`
  SELECT pg_advisory_xact_lock(hashtext(${oldTokenHash}))::text AS lock_result
`;

        const oldToken = await tx.refreshToken.findUnique({
            where: {
                tokenHash: oldTokenHash,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        role: true,
                        status: true,
                    },
                },
            },
        });

        if (!oldToken) {
            return {
                error: "INVALID_REFRESH_TOKEN",
            };
        }

        // Token đã bị thu hồi nhưng tiếp tục được sử dụng:
        // phát hiện replay và thu hồi toàn bộ family.
        if (oldToken.revokedAt) {
            await tx.refreshToken.updateMany({
                where: {
                    familyId: oldToken.familyId,
                    revokedAt: null,
                },
                data: {
                    revokedAt: now,
                },
            });

            return {
                error: "REFRESH_TOKEN_REUSE_DETECTED",
            };
        }

        if (oldToken.expiresAt <= now) {
            await tx.refreshToken.update({
                where: {
                    id: oldToken.id,
                },
                data: {
                    revokedAt: now,
                },
            });

            return {
                error: "REFRESH_TOKEN_EXPIRED",
            };
        }

        if (
            !oldToken.user ||
            oldToken.user.status !== "ACTIVE" ||
            !ALLOWED_ROLES.includes(oldToken.user.role)
        ) {
            await tx.refreshToken.updateMany({
                where: {
                    familyId: oldToken.familyId,
                    revokedAt: null,
                },
                data: {
                    revokedAt: now,
                },
            });

            return {
                error: "ACCOUNT_NOT_ACTIVE",
            };
        }

        // Thu hồi token cũ.
        await tx.refreshToken.update({
            where: {
                id: oldToken.id,
            },
            data: {
                revokedAt: now,
                lastUsedAt: now,
            },
        });

        // Tạo token mới trong cùng family.
        const newSession = await tx.refreshToken.create({
            data: {
                userId: oldToken.userId,
                familyId: oldToken.familyId,
                tokenHash: newTokenHash,
                deviceName: oldToken.deviceName,
                userAgent: oldToken.userAgent,
                expiresAt: newExpiresAt,
            },
            select: {
                id: true,
                expiresAt: true,
            },
        });

        return {
            refreshToken: newRawToken,
            expiresAt: newSession.expiresAt,
            sessionId: newSession.id,
            user: {
                id: oldToken.user.id,
                role: oldToken.user.role,
            },
        };
    });

    if (outcome.error) {
        throw new Error(outcome.error);
    }

    return outcome;
}

async function revokeRefreshToken(rawToken) {
    const tokenHash = hashRefreshToken(rawToken);
    const now = new Date();

    return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
  SELECT pg_advisory_xact_lock(hashtext(${tokenHash}))::text AS lock_result
`;

        const session = await tx.refreshToken.findUnique({
            where: {
                tokenHash,
            },
            select: {
                id: true,
                revokedAt: true,
            },
        });

        if (!session || session.revokedAt) {
            return {
                success: true,
                revoked: false,
            };
        }

        await tx.refreshToken.update({
            where: {
                id: session.id,
            },
            data: {
                revokedAt: now,
            },
        });

        return {
            success: true,
            revoked: true,
        };
    });
}

async function revokeAllRefreshTokens(userId) {
    if (typeof userId !== "string" || !userId.trim()) {
        throw new Error("INVALID_USER_ID");
    }

    const result = await prisma.refreshToken.updateMany({
        where: {
            userId,
            revokedAt: null,
        },
        data: {
            revokedAt: new Date(),
        },
    });

    return {
        success: true,
        revokedCount: result.count,
    };
}

module.exports = {
    createRefreshSession,
    rotateRefreshToken,
    revokeRefreshToken,
    revokeAllRefreshTokens,
    REFRESH_TOKEN_TTL_DAYS,
};
