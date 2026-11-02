const prisma = require("../../../core/database/prisma");

const {
    adminLoginSchema,
} = require("./admin-auth.validator");

const {
    verifyPassword,
    DUMMY_PASSWORD_HASH,
} = require("../../../core/security/password");

const {
    createSafeUser,
} = require("../shared/auth-user");

const {
    issueLoginTokens,
} = require("../shared/login-token.service");

async function loginAdmin(input, metadata = {}) {
    const validation = adminLoginSchema.safeParse(input);

    if (!validation.success) {
        const error = new Error("VALIDATION_ERROR");
        error.details = validation.error.flatten().fieldErrors;
        throw error;
    }

    const { email, password } = validation.data;

    const user = await prisma.user.findFirst({
        where: {
            email,
            role: "ADMIN",
        },
    });

    if (!user) {
        const dummyHash = await DUMMY_PASSWORD_HASH;
        await verifyPassword(dummyHash, password);

        throw new Error("INVALID_CREDENTIALS");
    }

    const passwordIsValid = await verifyPassword(
        user.passwordHash,
        password
    );

    if (!passwordIsValid) {
        throw new Error("INVALID_CREDENTIALS");
    }

    if (user.status !== "ACTIVE") {
        throw new Error("ACCOUNT_NOT_ACTIVE");
    }

    const tokens = await issueLoginTokens(user, metadata);

    return {
        success: true,
        user: createSafeUser(user, false),
        tokens,
    };
}

module.exports = {
    loginAdmin,
};
