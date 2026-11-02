const IS_PRODUCTION = process.env.NODE_ENV === "production";

function createRefreshCookieManager({
    cookieName,
    cookiePath,
}) {
    const name = IS_PRODUCTION
        ? `__Secure-${cookieName}`
        : cookieName;

    const options = {
        httpOnly: true,
        secure: IS_PRODUCTION,
        sameSite: "lax",
        path: cookiePath,
    };

    function getRefreshTokenFromRequest(req) {
        const cookieHeader = req.headers.cookie;

        if (!cookieHeader) {
            return null;
        }

        const cookies = {};

        for (const item of cookieHeader.split(";")) {
            const separatorIndex = item.indexOf("=");

            if (separatorIndex === -1) continue;

            const key = item.slice(0, separatorIndex).trim();
            const value = item.slice(separatorIndex + 1).trim();

            cookies[key] = value;
        }

        return cookies[name] || null;
    }

    function setRefreshCookie(res, token, expiresAt) {
        res.cookie(name, token, {
            ...options,
            expires: new Date(expiresAt),
        });
    }

    function clearRefreshCookie(res) {
        res.clearCookie(name, options);
    }

    return {
        getRefreshTokenFromRequest,
        setRefreshCookie,
        clearRefreshCookie,
    };
}

function getDeviceMetadata(req) {
    return {
        deviceName: req.get("x-device-name") || null,
        userAgent: req.get("user-agent") || null,
    };
}

function sendLoginResponse(res, result, setRefreshCookie) {
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

module.exports = {
    createRefreshCookieManager,
    getDeviceMetadata,
    sendLoginResponse,
};
