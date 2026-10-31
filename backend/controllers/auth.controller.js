const {
    verifyRegistrationOtp,
} = require("../services/registration-otp.service");

const prisma = require("../lib/prisma");

const {
    registerCustomer,
    loginCustomer,
    loginAdmin,
} = require("../services/auth.service");

const {
    rotateRefreshToken,
    revokeRefreshToken,
} = require("../services/refresh-token.service");

const {
    signAccessToken,
} = require("../utils/jwt");

const {
    requestPasswordReset,
    resetPassword,
} = require("../services/password-reset.service");

const IS_PRODUCTION = process.env.NODE_ENV === "production";

const REFRESH_COOKIE_NAME = IS_PRODUCTION
    ? "__Secure-refresh_token"
    : "refresh_token";

const REFRESH_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: "lax",
    path: "/api/auth",
};

function getRefreshTokenFromRequest(req) {
    const cookieHeader = req.headers.cookie;

    if (!cookieHeader) {
        return null;
    }

    const cookies = {};

    for (const item of cookieHeader.split(";")) {
        const separatorIndex = item.indexOf("=");

        if (separatorIndex === -1) {
            continue;
        }

        const name = item.slice(0, separatorIndex).trim();
        const value = item.slice(separatorIndex + 1).trim();

        cookies[name] = value;
    }

    return cookies[REFRESH_COOKIE_NAME] || null;
}

function setRefreshCookie(res, token, expiresAt) {
    res.cookie(REFRESH_COOKIE_NAME, token, {
        ...REFRESH_COOKIE_OPTIONS,
        expires: new Date(expiresAt),
    });
}

function clearRefreshCookie(res) {
    res.clearCookie(
        REFRESH_COOKIE_NAME,
        REFRESH_COOKIE_OPTIONS
    );
}

function getDeviceMetadata(req) {
    return {
        deviceName: req.get("x-device-name") || null,
        userAgent: req.get("user-agent") || null,
    };
}

function sendLoginResponse(res, result) {
    const {
        refreshToken,
        refreshTokenExpiresAt,
        ...publicTokens
    } = result.tokens;

    setRefreshCookie(
        res,
        refreshToken,
        refreshTokenExpiresAt
    );

    return res.status(200).json({
        success: true,
        user: result.user,
        tokens: {
            accessToken: publicTokens.accessToken,
            expiresIn: 900,
            tokenType: "Bearer",
        },
    });
}

// POST /api/auth/register
async function register(req, res) {
    const result = await registerCustomer(req.body);

    return res.status(201).json(result);
}

// POST /api/auth/verify-email
async function verifyEmail(req, res) {
    const email = req.body.email?.trim().toLowerCase();
    const code = req.body.code?.trim();

    if (!email || !/^\d{6}$/.test(code || "")) {
        return res.status(400).json({
            success: false,
            message: "INVALID_VERIFICATION_INPUT",
        });
    }

    const user = await prisma.user.findUnique({
        where: { email },
        select: {
            id: true,
            status: true,
        },
    });

    if (!user) {
        return res.status(400).json({
            success: false,
            message: "OTP_INVALID_OR_UNAVAILABLE",
        });
    }

    await verifyRegistrationOtp(user.id, code);

    return res.status(200).json({
        success: true,
        message: "Email verified successfully.",
    });
}

// POST /api/auth/login
async function loginCustomerController(req, res) {
    const result = await loginCustomer(
        req.body,
        getDeviceMetadata(req)
    );

    return sendLoginResponse(res, result);
}

// POST /api/admin/auth/login
async function loginAdminController(req, res) {
    const result = await loginAdmin(
        req.body,
        getDeviceMetadata(req)
    );

    return sendLoginResponse(res, result);
}

// POST /api/auth/refresh
async function refresh(req, res) {
    const oldRefreshToken = getRefreshTokenFromRequest(req);

    if (!oldRefreshToken) {
        const error = new Error("MISSING_REFRESH_TOKEN");
        error.statusCode = 401;
        throw error;
    }

    let rotatedSession = null;

    try {
        rotatedSession = await rotateRefreshToken(oldRefreshToken);

        const accessToken = signAccessToken({
            userId: rotatedSession.user.id,
            role: rotatedSession.user.role,
        });

        setRefreshCookie(
            res,
            rotatedSession.refreshToken,
            rotatedSession.expiresAt
        );

        return res.status(200).json({
            success: true,
            tokens: {
                accessToken,
                expiresIn: 900,
                tokenType: "Bearer",
            },
        });
    } catch (error) {
        // Nếu đã xoay token nhưng bước tiếp theo thất bại,
        // thu hồi token mới để tránh để lại session mồ côi.
        if (rotatedSession?.refreshToken) {
            try {
                await revokeRefreshToken(
                    rotatedSession.refreshToken
                );
            } catch (revokeError) {
                console.error(
                    "Failed to revoke replacement refresh token:",
                    revokeError.message
                );
            }
        }

        clearRefreshCookie(res);
        throw error;
    }
}

// POST /api/auth/logout
async function logout(req, res) {
    const refreshToken = getRefreshTokenFromRequest(req);

    try {
        if (refreshToken) {
            await revokeRefreshToken(refreshToken);
        }
    } finally {
        clearRefreshCookie(res);
    }

    return res.status(200).json({
        success: true,
        message: "Logged out successfully.",
    });
}

// POST /api/auth/forgot-password
async function forgotPassword(req, res) {
    await requestPasswordReset(req.body.email);

    return res.status(200).json({
        success: true,
        message: "If the account exists, a password reset email has been sent.",
    });
}

// POST /api/auth/reset-password
async function resetPasswordController(req, res) {
    await resetPassword(
        req.body.token,
        req.body.newPassword
    );

    return res.status(200).json({
        success: true,
        message: "Password has been reset successfully.",
    });
}

module.exports = {
    register,
    verifyEmail,
    loginCustomerController,
    loginAdminController,
    refresh,
    logout,
    forgotPassword,
    resetPasswordController,
};
