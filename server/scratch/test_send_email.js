// Load environment variables
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const { sendEmail } = require("../src/utils/mailer");

async function main() {
  console.log("Starting mailer test...");
  console.log("Environment variables loaded:");
  console.log("- RESEND_API_KEY:", process.env.RESEND_API_KEY ? "CONFIGURED" : "NOT CONFIGURED");
  console.log("- SMTP_HOST:", process.env.SMTP_HOST ? process.env.SMTP_HOST : "NOT CONFIGURED");

  try {
    const result = await sendEmail({
      to: "verbocat@verbolabs.com",
      subject: "🧪 Centroid Test Email",
      text: "This is a test email sent from the Centroid Collaborative Workspace mailer service.",
      html: `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2>🧪 Centroid Mailer Test</h2>
          <p>This is a test email confirming the Centroid mailer is working correctly.</p>
          <p>Recipient: <strong>divyanshusinghchouhan@verbolabs.com</strong></p>
        </div>
      `
    });

    console.log("Mailer test result:", result);
  } catch (err) {
    console.error("Mailer test failed with error:", err);
  }
}

main();
