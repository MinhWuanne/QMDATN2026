
const {
  verifyEmailConnection,
} = require("../services/email.service");

async function main() {
  try {
    await verifyEmailConnection();
    console.log("SMTP connection verified successfully!");
  } catch (error) {
    console.error("SMTP connection failed:", error.message);
    process.exitCode = 1;
  }
}

main();
