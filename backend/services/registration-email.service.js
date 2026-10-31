
const { sendEmail } = require("./email.service");
const {
  renderEmailTemplate,
} = require("../utils/email-template");

async function sendRegistrationOtpEmail({
  to,
  fullName,
  otp,
}) {
  if (!/^\d{6}$/.test(otp || "")) {
    throw new Error("Registration OTP must contain exactly 6 digits");
  }

  const html = renderEmailTemplate(
    "registration-otp.html",
    {
      fullName,
      otp,
    }
  );

  const text = [
    `Xin chào ${fullName},`,
    "",
    "Cảm ơn bạn đã đăng ký tài khoản QMDATN2026.",
    `Mã xác minh của bạn là: ${otp}`,
    "Mã có hiệu lực trong 5 phút.",
    "",
    "Không chia sẻ mã này với bất kỳ ai.",
    "Nếu bạn không thực hiện đăng ký, vui lòng bỏ qua email này.",
  ].join("\n");

  return sendEmail({
    to,
    subject: "Mã xác minh đăng ký tài khoản QMDATN2026",
    text,
    html,
  });
}

module.exports = {
  sendRegistrationOtpEmail,
};
