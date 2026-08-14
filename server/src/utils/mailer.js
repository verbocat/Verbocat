const axios = require("axios");

/**
 * Sends an email using Brevo REST API, Resend REST API, or SMTP (Nodemailer - Brevo Relay).
 *
 * @param {Object} options
 * @param {string} options.to Recipients email address
 * @param {string} options.subject Email subject
 * @param {string} [options.text] Plain text version of email
 * @param {string} [options.html] HTML version of email
 */
async function sendEmail({ to, subject, text, html }) {
  // Option 1: Brevo (Sendinblue) REST API v3 (Fastest, zero SMTP port blocking)
  const brevoApiKey = process.env.BREVO_API_KEY || process.env.SIB_API_KEY;
  if (brevoApiKey && brevoApiKey.trim().startsWith("xkeysib-")) {
    try {
      const rawFrom = process.env.EMAIL_FROM || "Centroid Access Requests <verbocat@verbolabs.com>";
      let fromEmail = "verbocat@verbolabs.com";
      let fromName = "Centroid Access Requests";

      if (rawFrom.includes("<") && rawFrom.includes(">")) {
        fromEmail = rawFrom.match(/<([^>]+)>/)?.[1] || fromEmail;
        fromName = rawFrom.split("<")[0].trim() || fromName;
      } else if (rawFrom.includes("@")) {
        fromEmail = rawFrom.trim();
      }

      console.log(`[Mailer] Dispatching email to ${to} via Brevo REST API...`);
      const response = await axios.post(
        "https://api.brevo.com/v3/smtp/email",
        {
          sender: { name: fromName, email: fromEmail },
          to: [{ email: to }],
          subject,
          htmlContent: html || text || text
        },
        {
          headers: {
            "api-key": brevoApiKey.trim(),
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          timeout: 10000
        }
      );
      console.log("[Mailer] Brevo API Email Sent Successfully!", response.data);
      return { success: true, provider: "brevo", data: response.data };
    } catch (error) {
      const apiErr = error.response?.data?.message || error.response?.data?.code || error.message;
      console.error("[Mailer] Brevo REST API Error:", apiErr);
      throw new Error(`Brevo REST API Error: ${apiErr}`);
    }
  }

  // Option 2: Resend REST API
  if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim().length > 0) {
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
            "Authorization": `Bearer ${process.env.RESEND_API_KEY.trim()}`,
            "Content-Type": "application/json",
          },
          timeout: 10000
        }
      );
      console.log("[Mailer] Resend API Email Sent Successfully:", response.data);
      return { success: true, provider: "resend", data: response.data };
    } catch (error) {
      console.error("[Mailer] Resend API Error:", error.response?.data || error.message);
      throw error;
    }
  }

  // Option 3: Brevo SMTP / Custom SMTP Relay via Nodemailer
  if (process.env.SMTP_HOST && process.env.SMTP_HOST.trim().length > 0) {
    try {
      const nodemailer = require("nodemailer");
      const cleanPass = String(process.env.SMTP_PASS || "")
        .split("#")[0]
        .replace(/\s+/g, "");

      console.log(`[Mailer] Dispatching email to ${to} via SMTP Relay (${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587})...`);

      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST.trim(),
        port: parseInt(process.env.SMTP_PORT || "587", 10),
        secure: process.env.SMTP_SECURE === "true", // true for 465, false for 587/25
        auth: {
          user: (process.env.SMTP_USER || "").trim(),
          pass: cleanPass,
        },
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 10000
      });

      const info = await transporter.sendMail({
        from: process.env.EMAIL_FROM || `"Centroid Access Requests" <${process.env.SMTP_USER}>`,
        to,
        subject,
        text,
        html,
      });

      console.log("[Mailer] SMTP Email Sent Successfully! Message ID:", info.messageId);
      return { success: true, provider: "smtp", messageId: info.messageId };
    } catch (error) {
      console.error("[Mailer] SMTP Error:", error.message);
      throw new Error(`SMTP Transport Error: ${error.message}`);
    }
  }

  // Fallback Option 4: Ethereal SMTP (Test Account)
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

  console.warn("Mailer Warning: No mailer configuration found (BREVO_API_KEY, RESEND_API_KEY, or SMTP_HOST).");
  return { success: false, error: "No mailer configuration found." };
}

module.exports = { sendEmail };
