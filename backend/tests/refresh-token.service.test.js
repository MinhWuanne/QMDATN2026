const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const prisma = require("../lib/prisma");

const {
  createRefreshSession,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  REFRESH_TOKEN_TTL_DAYS,
} = require("../services/refresh-token.service");

const {
  hashRefreshToken,
} = require("../utils/refresh-token");

async function createTestUser({ status = "ACTIVE" } = {}) {
  const id = crypto.randomUUID();

  return prisma.user.create({
    data: {
      fullName: "Refresh Token Test",
      email: `refresh-${id}@example.invalid`,
      passwordHash: "test-password-hash",
      role: "CUSTOMER",
      status,
      emailVerifiedAt: new Date(),
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

async function withTestUser(callback, options) {
  const user = await createTestUser(options);

  try {
    await callback(user);
  } finally {
    await cleanupUser(user.id);
  }
}

test("createRefreshSession tạo token hợp lệ và chỉ lưu hash vào database", async () => {
  await withTestUser(async (user) => {
    const before = Date.now();

    const result = await createRefreshSession({
      userId: user.id,
      deviceName: "  Windows Desktop  ",
      userAgent: "  Test Browser  ",
    });

    const after = Date.now();

    assert.match(result.refreshToken, /^[A-Za-z0-9_-]{43}$/);
    assert.ok(result.sessionId);
    assert.ok(result.expiresAt instanceof Date);

    const stored = await prisma.refreshToken.findUnique({
      where: {
        id: result.sessionId,
      },
    });

    assert.ok(stored);
    assert.equal(stored.userId, user.id);
    assert.equal(stored.tokenHash, hashRefreshToken(result.refreshToken));
    assert.notEqual(stored.tokenHash, result.refreshToken);
    assert.equal(stored.deviceName, "Windows Desktop");
    assert.equal(stored.userAgent, "Test Browser");
    assert.equal(stored.revokedAt, null);

    const expectedDuration =
      REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

    const actualDuration =
      result.expiresAt.getTime() - before;

    assert.ok(actualDuration >= expectedDuration);
    assert.ok(
      result.expiresAt.getTime() <= after + expectedDuration
    );
  });
});

test("createRefreshSession từ chối tài khoản không ACTIVE", async () => {
  await withTestUser(
    async (user) => {
      await assert.rejects(
        () => createRefreshSession({
          userId: user.id,
        }),
        {
          message: "ACCOUNT_NOT_ACTIVE",
        }
      );
    },
    { status: "LOCKED" }
  );
});

test("createRefreshSession từ chối user không tồn tại", async () => {
  await assert.rejects(
    () => createRefreshSession({
      userId: crypto.randomUUID(),
    }),
    {
      message: "ACCOUNT_NOT_ACTIVE",
    }
  );
});

test("rotateRefreshToken thu hồi token cũ và tạo token mới cùng family", async () => {
  await withTestUser(async (user) => {
    const original = await createRefreshSession({
      userId: user.id,
      deviceName: "Windows Desktop",
      userAgent: "Test Browser",
    });

    const rotated = await rotateRefreshToken(
      original.refreshToken
    );

    assert.notEqual(
      rotated.refreshToken,
      original.refreshToken
    );

    assert.match(
      rotated.refreshToken,
      /^[A-Za-z0-9_-]{43}$/
    );

    assert.equal(rotated.user.id, user.id);
    assert.equal(rotated.user.role, "CUSTOMER");

    const oldRecord = await prisma.refreshToken.findUnique({
      where: {
        tokenHash: hashRefreshToken(original.refreshToken),
      },
    });

    const newRecord = await prisma.refreshToken.findUnique({
      where: {
        id: rotated.sessionId,
      },
    });

    assert.ok(oldRecord.revokedAt instanceof Date);
    assert.ok(oldRecord.lastUsedAt instanceof Date);

    assert.ok(newRecord);
    assert.equal(newRecord.userId, user.id);
    assert.equal(newRecord.familyId, oldRecord.familyId);
    assert.equal(
      newRecord.tokenHash,
      hashRefreshToken(rotated.refreshToken)
    );
    assert.equal(newRecord.deviceName, "Windows Desktop");
    assert.equal(newRecord.userAgent, "Test Browser");
    assert.equal(newRecord.revokedAt, null);
  });
});

test("sử dụng lại token cũ sẽ phát hiện replay và thu hồi toàn bộ family", async () => {
  await withTestUser(async (user) => {
    const original = await createRefreshSession({
      userId: user.id,
    });

    const rotated = await rotateRefreshToken(
      original.refreshToken
    );

    await assert.rejects(
      () => rotateRefreshToken(original.refreshToken),
      {
        message: "REFRESH_TOKEN_REUSE_DETECTED",
      }
    );

    const family = await prisma.refreshToken.findMany({
      where: {
        familyId: (
          await prisma.refreshToken.findUnique({
            where: { id: original.sessionId },
            select: { familyId: true },
          })
        ).familyId,
      },
    });

    assert.equal(family.length, 2);

    for (const session of family) {
      assert.ok(session.revokedAt instanceof Date);
    }

    // Token mới cũng phải bị thu hồi khi phát hiện replay.
    assert.ok(
      family.some(
        (session) =>
          session.tokenHash === hashRefreshToken(rotated.refreshToken)
      )
    );
  });
});

test("rotateRefreshToken từ chối token hết hạn và đánh dấu revoked", async () => {
  await withTestUser(async (user) => {
    const session = await createRefreshSession({
      userId: user.id,
    });

    await prisma.refreshToken.update({
      where: {
        id: session.sessionId,
      },
      data: {
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    await assert.rejects(
      () => rotateRefreshToken(session.refreshToken),
      {
        message: "REFRESH_TOKEN_EXPIRED",
      }
    );

    const stored = await prisma.refreshToken.findUnique({
      where: {
        id: session.sessionId,
      },
    });

    assert.ok(stored.revokedAt instanceof Date);
  });
});

test("revokeRefreshToken chỉ đăng xuất phiên được chỉ định", async () => {
  await withTestUser(async (user) => {
    const first = await createRefreshSession({
      userId: user.id,
      deviceName: "Device 1",
    });

    const second = await createRefreshSession({
      userId: user.id,
      deviceName: "Device 2",
    });

    const result = await revokeRefreshToken(first.refreshToken);

    assert.deepEqual(result, {
      success: true,
      revoked: true,
    });

    const firstRecord = await prisma.refreshToken.findUnique({
      where: {
        id: first.sessionId,
      },
    });

    const secondRecord = await prisma.refreshToken.findUnique({
      where: {
        id: second.sessionId,
      },
    });

    assert.ok(firstRecord.revokedAt instanceof Date);
    assert.equal(secondRecord.revokedAt, null);
  });
});

test("revokeRefreshToken có tính idempotent", async () => {
  await withTestUser(async (user) => {
    const session = await createRefreshSession({
      userId: user.id,
    });

    const firstCall = await revokeRefreshToken(
      session.refreshToken
    );

    const secondCall = await revokeRefreshToken(
      session.refreshToken
    );

    assert.deepEqual(firstCall, {
      success: true,
      revoked: true,
    });

    assert.deepEqual(secondCall, {
      success: true,
      revoked: false,
    });
  });
});

test("revokeAllRefreshTokens thu hồi tất cả phiên còn hoạt động của user", async () => {
  await withTestUser(async (user) => {
    const first = await createRefreshSession({
      userId: user.id,
      deviceName: "Device 1",
    });

    const second = await createRefreshSession({
      userId: user.id,
      deviceName: "Device 2",
    });

    // Thu hồi trước một phiên để kiểm tra số lượng chính xác.
    await revokeRefreshToken(first.refreshToken);

    const result = await revokeAllRefreshTokens(user.id);

    assert.deepEqual(result, {
      success: true,
      revokedCount: 1,
    });

    const sessions = await prisma.refreshToken.findMany({
      where: {
        userId: user.id,
      },
    });

    assert.equal(sessions.length, 2);

    for (const session of sessions) {
      assert.ok(session.revokedAt instanceof Date);
    }

    const secondRecord = await prisma.refreshToken.findUnique({
      where: {
        id: second.sessionId,
      },
    });

    assert.ok(secondRecord.revokedAt instanceof Date);
  });
});

test("rotateRefreshToken từ chối token sai định dạng", async () => {
  await assert.rejects(
    () => rotateRefreshToken("invalid-token"),
    {
      message: "INVALID_REFRESH_TOKEN",
    }
  );
});