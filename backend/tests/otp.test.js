const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  generateOtp,
  hashOtp,
  verifyOtp,
} = require("../utils/otp");

const SECRET = "test-secret-for-otp-hashing-123456789";

const USER_ID = "user-123";
const PURPOSE = "REGISTER";
const CODE = "012345";

test("OTP được tạo có đúng 6 chữ số", () => {
  const otp = generateOtp();

  assert.match(otp, /^\d{6}$/);
});

test("Hash OTP tạo ra kết quả 64 ký tự hexadecimal", () => {
  const hash = hashOtp(
    {
      userId: USER_ID,
      purpose: PURPOSE,
      code: CODE,
    },
    SECRET
  );

  assert.match(hash, /^[a-f0-9]{64}$/);
});

test("OTP hợp lệ được xác minh thành công", () => {
  const hash = hashOtp(
    {
      userId: USER_ID,
      purpose: PURPOSE,
      code: CODE,
    },
    SECRET
  );

  assert.equal(
    verifyOtp(
      {
        userId: USER_ID,
        purpose: PURPOSE,
        code: CODE,
        storedHash: hash,
      },
      SECRET
    ),
    true
  );
});

test("OTP sai không được xác minh", () => {
  const hash = hashOtp(
    {
      userId: USER_ID,
      purpose: PURPOSE,
      code: CODE,
    },
    SECRET
  );

  assert.equal(
    verifyOtp(
      {
        userId: USER_ID,
        purpose: PURPOSE,
        code: "999999",
        storedHash: hash,
      },
      SECRET
    ),
    false
  );
});

test("OTP của tài khoản khác không hợp lệ", () => {
  const hash = hashOtp(
    {
      userId: USER_ID,
      purpose: PURPOSE,
      code: CODE,
    },
    SECRET
  );

  assert.equal(
    verifyOtp(
      {
        userId: "another-user",
        purpose: PURPOSE,
        code: CODE,
        storedHash: hash,
      },
      SECRET
    ),
    false
  );
});

test("OTP của mục đích khác không hợp lệ", () => {
  const hash = hashOtp(
    {
      userId: USER_ID,
      purpose: PURPOSE,
      code: CODE,
    },
    SECRET
  );

  assert.equal(
    verifyOtp(
      {
        userId: USER_ID,
        purpose: "PASSWORD_RESET",
        code: CODE,
        storedHash: hash,
      },
      SECRET
    ),
    false
  );
});

test("Từ chối secret ngắn hơn 32 ký tự", () => {
  assert.throws(
    () =>
      hashOtp(
        {
          userId: USER_ID,
          purpose: PURPOSE,
          code: CODE,
        },
        "short-secret"
      ),
    /at least 32 characters/
  );
});

test("Từ chối OTP không đủ 6 chữ số", () => {
  assert.equal(
    verifyOtp(
      {
        userId: USER_ID,
        purpose: PURPOSE,
        code: "12345",
        storedHash: "a".repeat(64),
      },
      SECRET
    ),
    false
  );
});