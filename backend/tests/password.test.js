const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  hashPassword,
  verifyPassword,
} = require("../utils/password");

test("Hash mật khẩu thành công", async () => {
  const password = "MyPassword123!";
  const hash = await hashPassword(password);

  assert.notEqual(hash, password);
  assert.match(hash, /^\$argon2id\$/);
});

test("Mật khẩu đúng được xác minh thành công", async () => {
  const password = "MyPassword123!";
  const hash = await hashPassword(password);

  const result = await verifyPassword(hash, password);

  assert.equal(result, true);
});

test("Mật khẩu sai bị từ chối", async () => {
  const hash = await hashPassword("MyPassword123!");

  const result = await verifyPassword(hash, "WrongPassword123!");

  assert.equal(result, false);
});

test("Hai lần hash cùng mật khẩu tạo ra hash khác nhau", async () => {
  const password = "MyPassword123!";

  const hash1 = await hashPassword(password);
  const hash2 = await hashPassword(password);

  assert.notEqual(hash1, hash2);
});

test("Hash không hợp lệ không làm ứng dụng bị crash", async () => {
  const result = await verifyPassword("invalid-hash", "password123");

  assert.equal(result, false);
});