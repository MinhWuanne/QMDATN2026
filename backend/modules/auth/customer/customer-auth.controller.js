const {
    verifyRegistrationOtp,
    issueRegistrationOtp,
} = require("./registration-otp.service");

const prisma = require("../../../core/database/prisma");

const {
    registerCustomer,
    loginCustomer,
} = require("./customer-auth.service");

const {
    rotateRefreshToken,
    revokeRefreshToken,
} = require("../shared/refresh-token.service");

const { signAccessToken } = require("../../../core/security/jwt");

const {
    requestPasswordReset,
    resetPassword,
} = require("./password-reset.service");

const {
    createRefreshCookieManager,
    getDeviceMetadata,
    sendLoginResponse,
} = require("../shared/auth-cookie");

const refreshCookie = createRefreshCookieManager({
    cookieName: "refresh_token",
    cookiePath: "/api/auth",
});

async function register(req, res) {
    const result = await registerCustomer(req.body);
    return res.status(201).json(result);
}

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

async function resendRegistrationOtpController(req, res) {
    const email = req.body.email.trim().toLowerCase();

    const user = await prisma.user.findFirst({
        where: {
            email,
            role: "CUSTOMER",
        },
        select: {
            id: true,
            status: true,
            emailVerifiedAt: true,
        },
    });

    if (
        user &&
        user.status === "PENDING_VERIFICATION" &&
        !user.emailVerifiedAt
    ) {
        try {
            await issueRegistrationOtp(user.id);
        } catch (error) {
            const expectedErrors = new Set([
                "OTP_RESEND_TOO_SOON",
                "OTP_SEND_LIMIT_EXCEEDED",
                "OTP_EMAIL_DELIVERY_FAILED",
            ]);

            if (!expectedErrors.has(error.message)) {
                throw error;
            }

            console.error("Registration OTP resend was not completed:", {
                code: error.message,
            });
        }
    }

    return res.status(200).json({
        success: true,
        message: "Nếu tài khoản cần xác minh và đủ điều kiện, mã OTP sẽ được gửi đến email.",
    });
}
async function loginCustomerController(req, res) {
    const result = await loginCustomer(
        req.body,
        getDeviceMetadata(req)
    );

    return sendLoginResponse(
        res,
        result,
        refreshCookie.setRefreshCookie
    );
}

async function refresh(req, res) {
    const oldRefreshToken =
        refreshCookie.getRefreshTokenFromRequest(req);

    if (!oldRefreshToken) {
        const error = new Error("MISSING_REFRESH_TOKEN");
        error.statusCode = 401;
        throw error;
    }

    let rotatedSession = null;

    try {
        rotatedSession = await rotateRefreshToken(
            oldRefreshToken,
            { expectedRole: "CUSTOMER" }
        );

        const user = await prisma.user.findUnique({
            where: {
                id: rotatedSession.user.id,
            },
            select: {
                id: true,
                fullName: true,
                email: true,
                role: true,
            },
        });

        if (!user) {
            throw new Error("ACCOUNT_NOT_FOUND");
        }

        const accessToken = signAccessToken({
            userId: rotatedSession.user.id,
            role: rotatedSession.user.role,
        });

        refreshCookie.setRefreshCookie(
            res,
            rotatedSession.refreshToken,
            rotatedSession.expiresAt
        );

        return res.status(200).json({
            success: true,
            user,
            tokens: {
                accessToken,
                expiresIn: 900,
                tokenType: "Bearer",
            },
        });
    } catch (error) {
        if (rotatedSession?.refreshToken) {
            try {
                await revokeRefreshToken(
                    rotatedSession.refreshToken,
                    { expectedRole: "CUSTOMER" }
                );
            } catch (revokeError) {
                console.error(
                    "Failed to revoke replacement refresh token:",
                    revokeError.message
                );
            }
        }

        refreshCookie.clearRefreshCookie(res);
        throw error;
    }
}

async function logout(req, res) {
    const refreshToken =
        refreshCookie.getRefreshTokenFromRequest(req);

    try {
        if (refreshToken) {
            await revokeRefreshToken(
                refreshToken,
                { expectedRole: "CUSTOMER" }
            );
        }
    } finally {
        refreshCookie.clearRefreshCookie(res);
    }

    return res.status(200).json({
        success: true,
        message: "Logged out successfully.",
    });
}

async function forgotPassword(req, res) {
    await requestPasswordReset(req.body.email);

    return res.status(200).json({
        success: true,
        message: "If the account exists, a password reset email has been sent.",
    });
}

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
    resendRegistrationOtpController,
    loginCustomerController,
    refresh,
    logout,
    forgotPassword,
    resetPasswordController,
};
