const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const prisma = require("../core/database/prisma");
const {
    hashPassword,
    verifyPassword,
} = require("../core/security/password");

const {
    createRefreshSession,
} = require("../modules/auth/shared/refresh-token.service");

const {
    changeCustomerPassword,
} = require("../modules/auth/customer/customer-password.service");

async function createTestUser({
    role = "CUSTOMER",
    status = "ACTIVE",
} = {}) {
    return prisma.user.create({
        data: {
            fullName: "Change Password Test",
            email: `change-password-${crypto.randomUUID()}@example.invalid`,
            passwordHash: await hashPassword("OldPassword123"),
            role,
            status,
            emailVerifiedAt:
                role === "CUSTOMER" && ["ACTIVE", "LOCKED"].includes(status)
                    ? new Date()
                    : null,
        },
    });
}

async function cleanupUser(userId) {
    await prisma.refreshToken.deleteMany({
        where: { userId },
    });

    await prisma.user.deleteMany({
        where: { id: userId },
    });
}

test("Customer changes password successfully and revokes all refresh sessions", async () => {
    let user;

    try {
        user = await createTestUser();

        await createRefreshSession({ userId: user.id });
        await createRefreshSession({ userId: user.id });

        const result = await changeCustomerPassword(user.id, {
            currentPassword: "OldPassword123",
            newPassword: "NewPassword123",
        });

        assert.equal(result.success, true);
        assert.equal(result.revokedCount, 2);

        const updatedUser = await prisma.user.findUnique({
            where: { id: user.id },
        });

        assert.equal(
            await verifyPassword(
                updatedUser.passwordHash,
                "NewPassword123"
            ),
            true
        );

        assert.equal(
            await verifyPassword(
                updatedUser.passwordHash,
                "OldPassword123"
            ),
            false
        );

        const sessions = await prisma.refreshToken.findMany({
            where: { userId: user.id },
        });

        assert.equal(sessions.length, 2);
        assert.ok(sessions.every((session) => session.revokedAt));
    } finally {
        if (user) await cleanupUser(user.id);
    }
});

test("Rejects incorrect current password without changing password or sessions", async () => {
    let user;

    try {
        user = await createTestUser();

        await createRefreshSession({ userId: user.id });

        await assert.rejects(
            () =>
                changeCustomerPassword(user.id, {
                    currentPassword: "WrongPassword123",
                    newPassword: "NewPassword123",
                }),
            (error) => error.message === "CURRENT_PASSWORD_INVALID"
        );

        const unchangedUser = await prisma.user.findUnique({
            where: { id: user.id },
        });

        assert.equal(
            await verifyPassword(
                unchangedUser.passwordHash,
                "OldPassword123"
            ),
            true
        );

        const sessions = await prisma.refreshToken.findMany({
            where: { userId: user.id },
        });

        assert.equal(sessions.length, 1);
        assert.equal(sessions[0].revokedAt, null);
    } finally {
        if (user) await cleanupUser(user.id);
    }
});

test("Admin cannot use Customer change password service", async () => {
    const admin = await prisma.user.findFirst({
        where: { role: "ADMIN" },
        select: {
            id: true,
            role: true,
            status: true,
        },
    });

    assert.ok(admin, "Test requires an existing Admin account");
    assert.equal(admin.role, "ADMIN");

    await assert.rejects(
        () =>
            changeCustomerPassword(admin.id, {
                currentPassword: "OldPassword123",
                newPassword: "NewPassword123",
            }),
        (error) => error.message === "INVALID_USER_ROLE"
    );
});

test("Rejects password change for inactive Customer", async () => {
    let user;

    try {
        user = await createTestUser({ status: "LOCKED" });

        await assert.rejects(
            () =>
                changeCustomerPassword(user.id, {
                    currentPassword: "OldPassword123",
                    newPassword: "NewPassword123",
                }),
            (error) => error.message === "ACCOUNT_NOT_ACTIVE"
        );
    } finally {
        if (user) await cleanupUser(user.id);
    }
});

test("Rejects password change for non-existing user", async () => {
    await assert.rejects(
        () =>
            changeCustomerPassword(crypto.randomUUID(), {
                currentPassword: "OldPassword123",
                newPassword: "NewPassword123",
            }),
        (error) => error.message === "ACCOUNT_NOT_FOUND"
    );
});

test("Only one concurrent password change can use the same old password", async () => {
    let user;

    try {
        user = await createTestUser();

        const results = await Promise.allSettled([
            changeCustomerPassword(user.id, {
                currentPassword: "OldPassword123",
                newPassword: "NewPassword123",
            }),
            changeCustomerPassword(user.id, {
                currentPassword: "OldPassword123",
                newPassword: "AnotherPassword123",
            }),
        ]);

        const successful = results.filter(
            (result) => result.status === "fulfilled"
        );

        const failed = results.filter(
            (result) => result.status === "rejected"
        );

        assert.equal(successful.length, 1);
        assert.equal(failed.length, 1);

        assert.equal(
            failed[0].reason.message,
            "PASSWORD_CHANGE_CONFLICT"
        );

        const updatedUser = await prisma.user.findUnique({
            where: { id: user.id },
        });

        const firstPasswordValid = await verifyPassword(
            updatedUser.passwordHash,
            "NewPassword123"
        );

        const secondPasswordValid = await verifyPassword(
            updatedUser.passwordHash,
            "AnotherPassword123"
        );

        assert.equal(
            firstPasswordValid || secondPasswordValid,
            true
        );

        assert.equal(
            firstPasswordValid && secondPasswordValid,
            false
        );
    } finally {
        if (user) await cleanupUser(user.id);
    }
});