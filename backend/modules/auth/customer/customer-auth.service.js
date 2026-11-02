const prisma = require("../../../core/database/prisma");

const {
    registerSchema,
    customerLoginSchema,
} = require("./customer-auth.validator");

const {
    hashPassword,
    verifyPassword,
    DUMMY_PASSWORD_HASH,
} = require("../../../core/security/password");

const {
    createSafeUser,
} = require("../shared/auth-user");

const {
    issueLoginTokens,
} = require("../shared/login-token.service");

const {
    issueRegistrationOtp,
} = require("./registration-otp.service");

function mapUniqueConstraintError(error) {
    if (error.code !== "P2002") {
        return null;
    }

    const target = error.meta?.target;

    if (Array.isArray(target) && target.includes("email")) {
        return new Error("EMAIL_ALREADY_EXISTS");
    }

    if (Array.isArray(target) && target.includes("phone")) {
        return new Error("PHONE_ALREADY_EXISTS");
    }

    if (typeof target === "string") {
        if (target.includes("email")) {
            return new Error("EMAIL_ALREADY_EXISTS");
        }

        if (target.includes("phone")) {
            return new Error("PHONE_ALREADY_EXISTS");
        }
    }

    return new Error("REGISTRATION_CONFLICT");
}

async function registerCustomer(
    input,
    {
        sendOtp = issueRegistrationOtp,
    } = {}
) {
    const validation = registerSchema.safeParse(input);

    if (!validation.success) {
        const error = new Error("VALIDATION_ERROR");
        error.details = validation.error.flatten().fieldErrors;
        throw error;
    }

    const data = validation.data;

    const existingUser = await prisma.user.findFirst({
        where: {
            OR: [
                { email: data.email },
                ...(data.phone ? [{ phone: data.phone }] : []),
            ],
        },
        select: {
            email: true,
            phone: true,
        },
    });

    if (existingUser) {
        if (existingUser.email === data.email) {
            throw new Error("EMAIL_ALREADY_EXISTS");
        }

        if (existingUser.phone === data.phone) {
            throw new Error("PHONE_ALREADY_EXISTS");
        }
    }

    const passwordHash = await hashPassword(data.password);

    let user;

    try {
        user = await prisma.user.create({
            data: {
                fullName: data.fullName,
                email: data.email,
                phone: data.phone || null,
                passwordHash,
                role: "CUSTOMER",
                status: "PENDING_VERIFICATION",
            },
            select: {
                id: true,
                fullName: true,
                email: true,
                phone: true,
                role: true,
                status: true,
                createdAt: true,
            },
        });
    } catch (error) {
        const mappedError = mapUniqueConstraintError(error);

        if (mappedError) {
            throw mappedError;
        }

        throw error;
    }

    try {
        await sendOtp(user.id);
    } catch (error) {
        const cause = error.cause;

        console.error("Failed to send registration OTP:", {
            message: error.message,
            causeMessage: cause?.message,
            code: cause?.code,
            responseCode: cause?.responseCode,
            command: cause?.command,
            response: cause?.response,
        });

        const registrationError = new Error(
            "REGISTRATION_EMAIL_DELIVERY_FAILED"
        );

        registrationError.userId = user.id;
        throw registrationError;
    }

    return {
        success: true,
        message: "Đăng ký thành công. Vui lòng kiểm tra email để xác minh tài khoản.",
        user,
    };
}

async function loginCustomer(input, metadata = {}) {
    const validation = customerLoginSchema.safeParse(input);

    if (!validation.success) {
        const error = new Error("VALIDATION_ERROR");
        error.details = validation.error.flatten().fieldErrors;
        throw error;
    }

    const { identifier, password } = validation.data;

    const isEmail = identifier.includes("@");

    const user = await prisma.user.findFirst({
        where: {
            role: "CUSTOMER",
            ...(isEmail
                ? { email: identifier.toLowerCase() }
                : { phone: identifier }),
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

    if (user.status === "PENDING_VERIFICATION") {
        throw new Error("EMAIL_NOT_VERIFIED");
    }

    if (user.status === "LOCKED") {
        throw new Error("ACCOUNT_LOCKED");
    }

    if (user.status !== "ACTIVE") {
        throw new Error("ACCOUNT_NOT_ACTIVE");
    }

    const tokens = await issueLoginTokens(user, metadata);

    return {
        success: true,
        user: createSafeUser(user),
        tokens,
    };
}

module.exports = {
    registerCustomer,
    loginCustomer,
};
