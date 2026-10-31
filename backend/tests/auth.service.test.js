require("../config/env");

const { getRequiredEnv } = require("../config/env");
const { revokeRefreshToken } = require("../services/refresh-token.service");

const ADMIN_EMAIL = getRequiredEnv("ADMIN_EMAIL");
const ADMIN_PASSWORD = getRequiredEnv("ADMIN_PASSWORD");

const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_ACCESS_SECRET =
  "test-only-jwt-secret-for-qmdatn2026-at-least-32-bytes";

const crypto = require("node:crypto");

const prisma = require("../lib/prisma");
const {
  registerCustomer,
  loginCustomer,
  loginAdmin,
} = require("../services/auth.service");

const {
  hashPassword,
  verifyPassword,
} = require("../utils/password");

function createRegistrationInput(overrides = {}) {
  return {
    fullName: "Registration Test",
    email: `register-${crypto.randomUUID()}@example.invalid`,
    password: "TestPassword123",
    ...overrides,
  };
}

async function createLoginTestUser({
  role = "CUSTOMER",
  status = "ACTIVE",
  email = `login-${crypto.randomUUID()}@example.invalid`,
  phone = null,
  password = "TestPassword123",
} = {}) {
  const passwordHash = await hashPassword(password);

  return prisma.user.create({
    data: {
      fullName: "Login Test User",
      email,
      phone,
      passwordHash,
      role,
      status,
      emailVerifiedAt:
        role === "CUSTOMER" && status !== "PENDING_VERIFICATION"
          ? new Date()
          : null,
    },
  });
}

async function cleanupUser(userId) {
  await prisma.refreshToken.deleteMany({
    where: { userId },
  });

  await prisma.user.delete({
    where: { id: userId },
  });
}

test("Register customer successfully", async () => {
  let userId;

  try {
    const input = createRegistrationInput();
    let sentUserId;

    const result = await registerCustomer(input, {
      sendOtp: async (id) => {
        sentUserId = id;
      },
    });

    userId = result.user.id;

    assert.equal(result.success, true);
    assert.equal(result.user.email, input.email);
    assert.equal(result.user.fullName, input.fullName);
    assert.equal(result.user.role, "CUSTOMER");
    assert.equal(result.user.status, "PENDING_VERIFICATION");
    assert.equal(sentUserId, userId);

    assert.equal(
      Object.hasOwn(result.user, "passwordHash"),
      false
    );

    const savedUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    assert.notEqual(savedUser.passwordHash, input.password);

    assert.equal(
      await verifyPassword(
        savedUser.passwordHash,
        input.password
      ),
      true
    );
  } finally {
    if (userId) await cleanupUser(userId);
  }
});

test("Reject invalid registration data", async () => {
  let sendOtpCalled = false;

  await assert.rejects(
    () =>
      registerCustomer(
        {
          fullName: "Invalid User",
          email: "invalid-email",
          password: "123",
        },
        {
          sendOtp: async () => {
            sendOtpCalled = true;
          },
        }
      ),
    (error) => {
      assert.equal(error.message, "VALIDATION_ERROR");
      assert.ok(error.details);
      return true;
    }
  );

  assert.equal(sendOtpCalled, false);
});

test("Reject registration with an existing email", async () => {
  let existingUser;

  try {
    existingUser = await prisma.user.create({
      data: {
        email: `existing-${crypto.randomUUID()}@example.invalid`,
        passwordHash: "integration-test-only",
        fullName: "Existing User",
        role: "CUSTOMER",
        status: "PENDING_VERIFICATION",
      },
    });

    await assert.rejects(
      () =>
        registerCustomer(
          createRegistrationInput({
            email: existingUser.email,
          }),
          {
            sendOtp: async () => { },
          }
        ),
      (error) => error.message === "EMAIL_ALREADY_EXISTS"
    );
  } finally {
    if (existingUser) {
      await cleanupUser(existingUser.id);
    }
  }
});

test("Reject registration with an existing phone number", async () => {
  let existingUser;

  try {
    const phone = `09${String(
      crypto.randomInt(0, 100000000)
    ).padStart(8, "0")}`;

    existingUser = await prisma.user.create({
      data: {
        email: `existing-phone-${crypto.randomUUID()}@example.invalid`,
        phone,
        passwordHash: "integration-test-only",
        fullName: "Existing Phone User",
        role: "CUSTOMER",
        status: "PENDING_VERIFICATION",
      },
    });

    await assert.rejects(
      () =>
        registerCustomer(
          createRegistrationInput({ phone }),
          {
            sendOtp: async () => { },
          }
        ),
      (error) => error.message === "PHONE_ALREADY_EXISTS"
    );
  } finally {
    if (existingUser) {
      await cleanupUser(existingUser.id);
    }
  }
});

test("Keep pending account when OTP email delivery fails", async () => {
  let createdUserId;

  try {
    const input = createRegistrationInput();

    await assert.rejects(
      () =>
        registerCustomer(input, {
          sendOtp: async () => {
            throw new Error("Simulated email delivery failure");
          },
        }),
      (error) => {
        assert.equal(
          error.message,
          "REGISTRATION_EMAIL_DELIVERY_FAILED"
        );

        assert.ok(error.userId);
        createdUserId = error.userId;

        return true;
      }
    );

    const savedUser = await prisma.user.findUnique({
      where: { id: createdUserId },
    });

    assert.ok(savedUser);
    assert.equal(savedUser.status, "PENDING_VERIFICATION");
    assert.equal(savedUser.emailVerifiedAt, null);
  } finally {
    if (createdUserId) {
      await cleanupUser(createdUserId);
    }
  }
});

test("Handle concurrent registrations with the same email", async () => {
  const input = createRegistrationInput();
  const results = await Promise.allSettled([
    registerCustomer(input, {
      sendOtp: async () => { },
    }),
    registerCustomer(input, {
      sendOtp: async () => { },
    }),
  ]);

  const successfulResults = results.filter(
    (result) => result.status === "fulfilled"
  );

  const failedResults = results.filter(
    (result) => result.status === "rejected"
  );

  try {
    assert.equal(successfulResults.length, 1);
    assert.equal(failedResults.length, 1);

    assert.equal(
      failedResults[0].reason.message,
      "EMAIL_ALREADY_EXISTS"
    );
  } finally {
    for (const result of successfulResults) {
      await cleanupUser(result.value.user.id);
    }
  }
});

test("Handle concurrent registrations with the same phone", async () => {
  const phone = `09${String(
    crypto.randomInt(0, 100000000)
  ).padStart(8, "0")}`;

  const input1 = createRegistrationInput({ phone });
  const input2 = createRegistrationInput({ phone });

  const results = await Promise.allSettled([
    registerCustomer(input1, {
      sendOtp: async () => { },
    }),
    registerCustomer(input2, {
      sendOtp: async () => { },
    }),
  ]);

  const successfulResults = results.filter(
    (result) => result.status === "fulfilled"
  );

  const failedResults = results.filter(
    (result) => result.status === "rejected"
  );

  try {
    assert.equal(successfulResults.length, 1);
    assert.equal(failedResults.length, 1);

    assert.equal(
      failedResults[0].reason.message,
      "PHONE_ALREADY_EXISTS"
    );
  } finally {
    for (const result of successfulResults) {
      await cleanupUser(result.value.user.id);
    }
  }
});

test("Customer login successfully with email", async () => {
  let user;

  try {
    user = await createLoginTestUser();

    const result = await loginCustomer({
      identifier: user.email,
      password: "TestPassword123",
    });

    assert.equal(result.success, true);
    assert.equal(result.user.id, user.id);
    assert.equal(result.user.email, user.email);
    assert.equal(result.user.role, "CUSTOMER");
    assert.equal(result.user.status, "ACTIVE");

    assert.equal(
      Object.hasOwn(result.user, "passwordHash"),
      false
    );
  } finally {
    if (user) await cleanupUser(user.id);
  }
});

test("Customer login successfully with phone number", async () => {
  let user;

  try {
    const phone = `09${String(
      crypto.randomInt(0, 100000000)
    ).padStart(8, "0")}`;

    user = await createLoginTestUser({ phone });

    const result = await loginCustomer({
      identifier: phone,
      password: "TestPassword123",
    });

    assert.equal(result.success, true);
    assert.equal(result.user.id, user.id);
    assert.equal(result.user.phone, phone);
  } finally {
    if (user) await cleanupUser(user.id);
  }
});

test("Customer login rejects incorrect password", async () => {
  let user;

  try {
    user = await createLoginTestUser();

    await assert.rejects(
      () =>
        loginCustomer({
          identifier: user.email,
          password: "WrongPassword123",
        }),
      (error) => error.message === "INVALID_CREDENTIALS"
    );
  } finally {
    if (user) await cleanupUser(user.id);
  }
});

test("Customer login rejects non-existing account", async () => {
  await assert.rejects(
    () =>
      loginCustomer({
        identifier: `missing-${crypto.randomUUID()}@example.invalid`,
        password: "TestPassword123",
      }),
    (error) => error.message === "INVALID_CREDENTIALS"
  );
});

test("Customer login rejects unverified account", async () => {
  let user;

  try {
    user = await createLoginTestUser({
      status: "PENDING_VERIFICATION",
    });

    await assert.rejects(
      () =>
        loginCustomer({
          identifier: user.email,
          password: "TestPassword123",
        }),
      (error) => error.message === "EMAIL_NOT_VERIFIED"
    );
  } finally {
    if (user) await cleanupUser(user.id);
  }
});

test("Customer login rejects locked account", async () => {
  let user;

  try {
    user = await createLoginTestUser({
      status: "LOCKED",
    });

    await assert.rejects(
      () =>
        loginCustomer({
          identifier: user.email,
          password: "TestPassword123",
        }),
      (error) => error.message === "ACCOUNT_LOCKED"
    );
  } finally {
    if (user) await cleanupUser(user.id);
  }
});

test("Admin login successfully with email", async () => {
  let refreshToken;

  try {
    const result = await loginAdmin({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

    refreshToken = result.tokens.refreshToken;

    assert.equal(result.success, true);
    assert.equal(result.user.email, ADMIN_EMAIL);
    assert.equal(result.user.role, "ADMIN");
    assert.equal(result.user.status, "ACTIVE");

    assert.equal(
      Object.hasOwn(result.user, "passwordHash"),
      false
    );

    assert.ok(result.tokens.accessToken);
    assert.ok(result.tokens.refreshToken);
    assert.ok(result.tokens.sessionId);
  } finally {
    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }
  }
});

test("Admin login rejects incorrect password", async () => {
  await assert.rejects(
    () =>
      loginAdmin({
        email: ADMIN_EMAIL,
        password: "DefinitelyWrongPassword123!",
      }),
    (error) => error.message === "INVALID_CREDENTIALS"
  );
});

test("Customer login rejects Admin account", async () => {
  await assert.rejects(
    () =>
      loginCustomer({
        identifier: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      }),
    (error) => error.message === "INVALID_CREDENTIALS"
  );
});
