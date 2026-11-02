const { loginAdmin } = require("./admin-auth.service");

const {
    rotateRefreshToken,
    revokeRefreshToken,
} = require("../shared/refresh-token.service");

const { signAccessToken } = require("../../../core/security/jwt");

const {
    createRefreshCookieManager,
    getDeviceMetadata,
    sendLoginResponse,
} = require("../shared/auth-cookie");

const refreshCookie = createRefreshCookieManager({
    cookieName: "admin_refresh_token",
    cookiePath: "/api/admin/auth",
});

const { createSafeUser } = require("../shared/auth-user");

async function loginAdminController(req, res) {
    const result = await loginAdmin(
        req.body,
        getDeviceMetadata(req)
    );

    return sendLoginResponse(
        res,
        result,
        refreshCookie.setRefreshCookie
    );
}

async function refreshAdmin(req, res) {
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
            { expectedRole: "ADMIN" }
        );

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
            user: createSafeUser(rotatedSession.user, false),
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
                    { expectedRole: "ADMIN" }
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

async function logoutAdmin(req, res) {
    const refreshToken =
        refreshCookie.getRefreshTokenFromRequest(req);

    try {
        if (refreshToken) {
            await revokeRefreshToken(
                refreshToken,
                { expectedRole: "ADMIN" }
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

module.exports = {
    loginAdminController,
    refreshAdmin,
    logoutAdmin,
};
