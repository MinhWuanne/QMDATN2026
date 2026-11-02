const { signAccessToken } = require("../../../core/security/jwt");

const {
    createRefreshSession,
    revokeRefreshToken,
} = require("./refresh-token.service");

async function issueLoginTokens(user, metadata = {}) {
    const session = await createRefreshSession({
        userId: user.id,
        deviceName: metadata.deviceName,
        userAgent: metadata.userAgent,
    });

    try {
        const accessToken = signAccessToken({
            userId: user.id,
            role: user.role,
        });

        return {
            accessToken,
            refreshToken: session.refreshToken,
            refreshTokenExpiresAt: session.expiresAt,
            sessionId: session.sessionId,
        };
    } catch (error) {
        await revokeRefreshToken(session.refreshToken);
        throw error;
    }
}

module.exports = {
    issueLoginTokens,
};