
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  generateRefreshToken,
  hashRefreshToken,
} = require("../utils/refresh-token");

test("Generate refresh token with 256-bit entropy", () => {
  const token = generateRefreshToken();

  assert.equal(token.length, 43);
  assert.match(token, /^[A-Za-z0-9_-]+$/);
});

test("Generate different tokens each time", () => {
  const token1 = generateRefreshToken();
  const token2 = generateRefreshToken();

  assert.notEqual(token1, token2);
});

test("Hash refresh token successfully", () => {
  const token = generateRefreshToken();
  const hash = hashRefreshToken(token);

  assert.equal(hash.length, 64);
  assert.match(hash, /^[a-f0-9]{64}$/);
});

test("Same refresh token produces same hash", () => {
  const token = generateRefreshToken();

  assert.equal(
    hashRefreshToken(token),
    hashRefreshToken(token)
  );
});

test("Different refresh tokens produce different hashes", () => {
  const token1 = generateRefreshToken();
  const token2 = generateRefreshToken();

  assert.notEqual(
    hashRefreshToken(token1),
    hashRefreshToken(token2)
  );
});

test("Reject empty refresh token", () => {
  assert.throws(
    () => hashRefreshToken(""),
    { message: "INVALID_REFRESH_TOKEN" }
  );
});

test("Reject malformed refresh token", () => {
  assert.throws(
    () => hashRefreshToken("invalid-token"),
    { message: "INVALID_REFRESH_TOKEN" }
  );
});

test("Reject non-string refresh token", () => {
  assert.throws(
    () => hashRefreshToken(null),
    { message: "INVALID_REFRESH_TOKEN" }
  );
});
