
const nodemailer = require("nodemailer");
const { getRequiredEnv } = require("../config/env");

const transporter = nodemailer.createTransport({
  host: getRequiredEnv("SMTP_HOST"),
  port: Number(getRequiredEnv("SMTP_PORT")),
  secure: false,
  requireTLS: true,
  auth: {
    user: getRequiredEnv("SMTP_USER"),
    pass: getRequiredEnv("SMTP_PASS"),
  },
});

async function verifyEmailConnection() {
  return transporter.verify();
}

async function sendEmail({ to, subject, text, html }) {
  return transporter.sendMail({
    from: {
      name: getRequiredEnv("MAIL_FROM_NAME"),
      address: getRequiredEnv("MAIL_FROM_ADDRESS"),
    },
    to,
    subject,
    text,
    html,
  });
}

module.exports = {
  verifyEmailConnection,
  sendEmail,
};
