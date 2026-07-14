const axios = require("axios");

/**
 * Sends an email using Resend REST API or SMTP (Nodemailer) based on configured environment variables.
 * Both options provide free email sending tiers (Resend gives 3,000 free emails/month).
 *
 * @param {Object} options
 * @param {string} options.to Recipients email address
 * @param {string} options.subject Email subject
 * @param {string} [options.text] Plain text version of email
 * @param {string} [options.html] HTML version of email
 */
async function sendEmail({ to, subject, text, html }) {
  // Option 1: Resend REST API (Free 3,000 emails/month, 100/day. No extra npm library needed)
  if (process.env.RESEND_API_KEY) {
    try {
      const response = await axios.post(
        "https://api.resend.com/emails",
        {
          from: process.env.EMAIL_FROM || "Centroid Access Requests <onboarding@resend.dev>",
          to,
          subject,
          html: html || text,
        },
        {
          headers: {
            "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log("Email sent successfully via Resend API:", response.data);
      return { success: true, provider: "resend", data: response.data };
    } catch (error) {
      console.error("Failed to send email via Resend API:", error.response?.data || error.message);
      throw error;
    }
  }

  // Option 2: SMTP Transport via Nodemailer (Free with custom SMTP relays like Gmail, Brevo, SendGrid SMTP)
  if (process.env.SMTP_HOST) {
    try {
      const nodemailer = require("nodemailer");
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "587", 10),
        secure: process.env.SMTP_SECURE === "true", // true for 465, false for 587/25
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      const info = await transporter.sendMail({
        from: process.env.EMAIL_FROM || `"Centroid Access Requests" <${process.env.SMTP_USER}>`,
        to,
        subject,
        text,
        html,
      });

      console.log("Email sent successfully via SMTP:", info.messageId);
      return { success: true, provider: "smtp", messageId: info.messageId };
    } catch (error) {
      console.error("Failed to send email via SMTP:", error.message);
      throw error;
    }
  }

  // Fallback Option 3: Ethereal SMTP (Automatically creates a free test account for local development)
  try {
    const nodemailer = require("nodemailer");
    const testAccount = await nodemailer.createTestAccount();
    const transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });

    const info = await transporter.sendMail({
      from: '"Centroid Testing" <test@centroid.com>',
      to,
      subject,
      text,
      html,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    console.log("-----------------------------------------");
    console.log("📧 Test Email Sent (Ethereal Debugger)");
    console.log("Recipient:", to);
    console.log("Preview Link:", previewUrl);
    console.log("-----------------------------------------");
    return { success: true, provider: "ethereal", previewUrl };
  } catch (err) {
    console.error("Failed to send test email via Ethereal fallback:", err.message);
  }

  console.warn("Mailer Warning: Neither RESEND_API_KEY nor SMTP_HOST environment variables are configured. Email skipped.");
  return { success: false, error: "No mailer configuration found." };
}

module.exports = { sendEmail };
