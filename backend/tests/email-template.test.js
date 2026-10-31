
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  renderEmailTemplate,
} = require("../utils/email-template");

test("Render registration OTP template with correct values", () => {
  const html = renderEmailTemplate("registration-otp.html", {
    fullName: "Nguyen Van A",
    otp: "012345",
  });

  assert.ok(html.includes("Nguyen Van A"));
  assert.ok(html.includes("012345"));
  assert.ok(html.includes("5 phút"));
});

test("Escape HTML characters in user-provided values", () => {
  const html = renderEmailTemplate("registration-otp.html", {
    fullName: '<script>alert("XSS")</script>',
    otp: "123456",
  });

  assert.ok(!html.includes('<script>alert("XSS")</script>'));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("Preserve leading zero in OTP", () => {
  const html = renderEmailTemplate("registration-otp.html", {
    fullName: "Test User",
    otp: "000123",
  });

  assert.ok(html.includes("000123"));
});

test("Throw error when a template variable is missing", () => {
  assert.throws(
    () =>
      renderEmailTemplate("registration-otp.html", {
        fullName: "Test User",
      }),
    /Missing email template variable: otp/
  );
});
