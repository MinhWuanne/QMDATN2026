
const {
  sendRegistrationOtpEmail,
} = require("../services/registration-email.service");

async function main() {
  try {
    const result = await sendRegistrationOtpEmail({
      to: "xapep28594@hopefunder.com",
      fullName: "Test User",
      otp: "012345",
    });

    console.log("Test email sent successfully!");
    console.log("Message ID:", result.messageId);
  } catch (error) {
    console.error("Failed to send test email:", error.message);
    process.exitCode = 1;
  }
}

main();
