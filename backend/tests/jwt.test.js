
const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const {
  signAccessToken,
  verifyAccessToken,
  ACCESS_TOKEN_TTL,
} = require("../utils/jwt");

const TEST_SECRET =
  "test-secret-for-jwt-unit-tests-at-least-32-bytes";

const TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440000";

const JWT_ISSUER = "qmdatn2026-api";
const JWT_AUDIENCE = "qmdatn2026-web";

test("Sign and verify Customer access token", () => {
  process.env.JWT_ACCESS_SECRET = TEST_SECRET;

  const token = signAccessToken({
    userId: TEST_USER_ID,
    role: "CUSTOMER",
  });

  const payload = verifyAccessToken(token);

  assert.equal(payload.userId, TEST_USER_ID);
  assert.equal(payload.role, "CUSTOMER");
  assert.ok(payload.tokenId);
  assert.ok(payload.issuedAt);
  assert.ok(payload.expiresAt);
});

test("Sign and verify Admin access token", () => {
  process.env.JWT_ACCESS_SECRET = TEST_SECRET;

  const token = signAccessToken({
    userId: TEST_USER_ID,
    role: "ADMIN",
  });

  const payload = verifyAccessToken(token);

  assert.equal(payload.userId, TEST_USER_ID);
  assert.equal(payload.role, "ADMIN");
});

test("Access token expires after 15 minutes", () => {
  assert.equal(ACCESS_TOKEN_TTL, "15m");
});

test("Reject missing user ID", () => {
  process.env.JWT_ACCESS_SECRET = TEST_SECRET;

  assert.throws(
    () => signAccessToken({ role: "CUSTOMER" }),
    { message: "INVALID_TOKEN_SUBJECT" }
  );
});

test("Reject invalid role", () => {
  process.env.JWT_ACCESS_SECRET = TEST_SECRET;

  assert.throws(
    () =>
      signAccessToken({
        userId: TEST_USER_ID,
        role: "SUPER_ADMIN",
      }),
    { message: "INVALID_TOKEN_ROLE" }
  );
});

test("Reject empty access token", () => {
  process.env.JWT_ACCESS_SECRET = TEST_SECRET;

  assert.throws(
    () => verifyAccessToken(""),
    { message: "INVALID_ACCESS_TOKEN" }
  );
});

test("Reject token signed with another secret", () => {
  process.env.JWT_ACCESS_SECRET = TEST_SECRET;

  const token = jwt.sign(
    { role: "CUSTOMER" },
    "another-secret-with-at-least-32-bytes",
    {
      algorithm: "HS256",
      subject: TEST_USER_ID,
      jwtid: "test-token-id",
      expiresIn: "15m",
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }
  );

  assert.throws(() => verifyAccessToken(token));
});

test("Reject expired access token", () => {
  process.env.JWT_ACCESS_SECRET = TEST_SECRET;

  const token = jwt.sign(
    { role: "CUSTOMER" },
    TEST_SECRET,
    {
      algorithm: "HS256",
      subject: TEST_USER_ID,
      jwtid: "expired-token-id",
      expiresIn: -1,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }
  );

  assert.throws(
    () => verifyAccessToken(token),
    { name: "TokenExpiredError" }
  );
});

test("Reject access token without JWT secret", () => {
  delete process.env.JWT_ACCESS_SECRET;

  assert.throws(
    () =>
      signAccessToken({
        userId: TEST_USER_ID,
        role: "CUSTOMER",
      }),
    /Missing required environment variable/
  );

  process.env.JWT_ACCESS_SECRET = TEST_SECRET;
});

test("Reject JWT secret shorter than 32 bytes", () => {
  process.env.JWT_ACCESS_SECRET = "short-secret";

  assert.throws(
    () =>
      signAccessToken({
        userId: TEST_USER_ID,
        role: "CUSTOMER",
      }),
    /must be at least 32 bytes/
  );

  process.env.JWT_ACCESS_SECRET = TEST_SECRET;
});
