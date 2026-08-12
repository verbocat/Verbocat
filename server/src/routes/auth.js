const express = require("express");
const { supabase, supabaseAdmin } = require("../config/supabase");
const { checkAuth } = require("../utils/authMiddleware");
const { authRateLimiter } = require("../utils/rateLimiter");
const { sendEmail } = require("../utils/mailer");

const authRouter = express.Router();


const validatePasswordSecurity = (pass) => {
  if (!pass || pass.length < 8) {
    return "Password must be at least 8 characters long.";
  }
  if (!/[A-Z]/.test(pass)) {
    return "Password must contain at least one uppercase letter (A-Z).";
  }
  if (!/[0-9]/.test(pass)) {
    return "Password must contain at least one number (0-9).";
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pass)) {
    return "Password must contain at least one special character (!@#$%^&*...).";
  }
  return null;
};

const normalizeEmail = (email) => String(email || "").toLowerCase().trim();

const sanitizeSearchQuery = (queryStr) => {
  return String(queryStr || "")
    .trim()
    .toLowerCase()
    .slice(0, 64)
    .replace(/[%_,]/g, "");
};

const includeVerificationLink = (actionLink) => {
  if (process.env.NODE_ENV !== "production" && actionLink) {
    return { verificationLink: actionLink };
  }
  return {};
};

async function findExistingAuthUser(cleanEmail) {
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("email", cleanEmail)
    .maybeSingle();

  if (profileRow?.id) {
    const { data: adminUserRes } = await supabaseAdmin.auth.admin.getUserById(profileRow.id);
    if (adminUserRes?.user) {
      return adminUserRes.user;
    }
  }

  return null;
}

// 1. User Account Registration / Join Space
authRouter.post("/register", authRateLimiter, async (request, response) => {
  try {
    const { name, email, password } = request.body;

    if (!name || !email || !password) {
      return response.status(400).json({ error: "Full Name, email, and password are required" });
    }

    const secError = validatePasswordSecurity(password);
    if (secError) {
      return response.status(400).json({ error: secError });
    }

    const tenantId = request.tenant?.id;
    const tenantName = request.tenant?.name || "this";
    const cleanEmail = normalizeEmail(email);
    const cleanName = name.trim();

    let existingUser = null;
    try {
      existingUser = await findExistingAuthUser(cleanEmail);
    } catch (err) {
      console.warn("Register user lookup error:", err?.message);
    }

    let redirectTo = request.headers.origin || "http://localhost:5173";
    if (!redirectTo.endsWith("/")) {
      redirectTo += "/";
    }

    if (existingUser) {
      const isAlreadyConfirmed = !!(existingUser.email_confirmed_at || existingUser.confirmed_at);

      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password
      });

      if (loginError) {
        return response.status(400).json({
          error: "Incorrect password. Please try again with your existing account password."
        });
      }

      if (!isAlreadyConfirmed) {
        try {
          await supabaseAdmin.auth.admin.updateUserById(existingUser.id, { email_confirm: false });
        } catch (_) {}

        await supabase
          .from("profiles")
          .upsert({
            id: existingUser.id,
            email: cleanEmail,
            name: cleanName,
            full_name: cleanName,
            organization_id: tenantId || null,
            status: "pending_verification",
            email_verified: false
          }, { onConflict: "id" });
      } else {
        await supabase
          .from("profiles")
          .upsert({
            id: existingUser.id,
            email: cleanEmail,
            name: cleanName,
            full_name: cleanName,
            organization_id: tenantId || null
          }, { onConflict: "id" });
      }

      if (tenantId) {
        try {
          await supabase
            .from("user_tenant_memberships")
            .upsert({
              user_id: existingUser.id,
              organization_id: tenantId,
              role: "linguist",
              credits_allowed: 50000,
              status: "pending_verification"
            }, { onConflict: "user_id,organization_id" });
        } catch (_) {}
      }

      let actionLink = null;
      try {
        const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
          type: "signup",
          email: cleanEmail,
          password,
          options: { redirectTo }
        });
        actionLink = linkData?.properties?.action_link;
      } catch (err) {
        console.error("Register generate link error:", err?.message);
      }

      if (actionLink) {
        sendEmail({
          to: cleanEmail,
          subject: "Verify Your Centroid Workspace Account",
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 20px; background-color: #ffffff; color: #0f172a;">
              <div style="margin-bottom: 20px; text-align: center;">
                <h1 style="color: #4f46e5; font-size: 24px; font-weight: 800; margin: 0;">Centroid CAT</h1>
                <p style="color: #64748b; font-size: 12px; margin-top: 4px; font-weight: 500;">Next-Gen Enterprise Localization</p>
              </div>
              
              <h2 style="font-size: 18px; font-weight: 700; color: #0f172a; margin-top: 0;">Welcome back, ${cleanName}! 👋</h2>
              <p style="font-size: 14px; color: #475569; line-height: 1.6;">
                You requested to register for the <strong>${tenantName}</strong> workspace. Please click the button below to verify your email (<strong>${cleanEmail}</strong>) and activate your access.
              </p>

              <div style="margin: 28px 0; text-align: center;">
                <a href="${actionLink}" target="_blank" style="background-color: #4f46e5; color: #ffffff; font-size: 14px; font-weight: 700; padding: 14px 28px; text-decoration: none; border-radius: 14px; display: inline-block; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25);">
                  Verify Email & Activate Account →
                </a>
              </div>

              <p style="font-size: 12px; color: #94a3b8; line-height: 1.5; border-top: 1px solid #f1f5f9; pt: 16px;">
                If the button doesn't work, copy and paste this link into your browser:<br/>
                <a href="${actionLink}" style="color: #4f46e5; word-break: break-all;">${actionLink}</a>
              </p>
            </div>
          `
        }).catch(e => console.error("Register mailer error:", e?.message || e));
      }

      return response.json({
        message: `Signup successful! A verification email has been dispatched to ${cleanEmail}. Please check your inbox and click the verification button to activate your account.`,
        user: { id: existingUser.id, email: cleanEmail, name: cleanName },
        requiresVerification: true,
        ...includeVerificationLink(actionLink)
      });
    }

    const { data: adminData, error: adminErr } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: false,
      user_metadata: { name: cleanName, full_name: cleanName }
    });

    if (adminErr) {
      if (/already|registered|exists/i.test(adminErr.message || "")) {
        const retryUser = await findExistingAuthUser(cleanEmail);
        if (retryUser) {
          return response.status(400).json({
            error: "An account with this email already exists. Please sign in or use your existing password to join this workspace."
          });
        }
      }
      return response.status(400).json({ error: adminErr.message });
    }

    const user = adminData.user;

    try {
      await supabaseAdmin.auth.admin.updateUserById(user.id, { email_confirm: false });
    } catch (_) {}

    let actionLink = null;
    try {
      const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
        type: "signup",
        email: cleanEmail,
        password,
        options: { redirectTo }
      });
      actionLink = linkData?.properties?.action_link;
    } catch (err) {
      console.error("Register generate link error:", err?.message);
    }

    if (actionLink) {
      sendEmail({
        to: cleanEmail,
        subject: "Verify Your Centroid Workspace Account",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 20px; background-color: #ffffff; color: #0f172a;">
            <div style="margin-bottom: 20px; text-align: center;">
              <h1 style="color: #4f46e5; font-size: 24px; font-weight: 800; margin: 0;">Centroid CAT</h1>
              <p style="color: #64748b; font-size: 12px; margin-top: 4px; font-weight: 500;">Next-Gen Enterprise Localization</p>
            </div>
            
            <h2 style="font-size: 18px; font-weight: 700; color: #0f172a; margin-top: 0;">Welcome, ${cleanName}! 👋</h2>
            <p style="font-size: 14px; color: #475569; line-height: 1.6;">
              Thank you for creating an account. Please click the button below to verify your email address (<strong>${cleanEmail}</strong>) and activate your account.
            </p>

            <div style="margin: 28px 0; text-align: center;">
              <a href="${actionLink}" target="_blank" style="background-color: #4f46e5; color: #ffffff; font-size: 14px; font-weight: 700; padding: 14px 28px; text-decoration: none; border-radius: 14px; display: inline-block; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25);">
                Verify Email & Activate Account →
              </a>
            </div>

            <p style="font-size: 12px; color: #94a3b8; line-height: 1.5; border-top: 1px solid #f1f5f9; pt: 16px;">
              If the button doesn't work, copy and paste this link into your browser:<br/>
              <a href="${actionLink}" style="color: #4f46e5; word-break: break-all;">${actionLink}</a>
            </p>
          </div>
        `
      }).catch(e => console.error("Register mailer error:", e?.message || e));
    }

    if (user) {
      await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          email: user.email,
          name: cleanName,
          full_name: cleanName,
          role: "linguist",
          organization_id: tenantId || null,
          credits_allowed: 50000,
          status: "pending_verification",
          email_verified: false
        }, { onConflict: "id" });

      if (tenantId) {
        try {
          await supabase
            .from("user_tenant_memberships")
            .upsert({
              user_id: user.id,
              organization_id: tenantId,
              role: "linguist",
              credits_allowed: 50000,
              status: "pending_verification"
            }, { onConflict: "user_id,organization_id" });
        } catch (_) {}
      }
    }

    return response.json({
      message: `Account created successfully! A verification email has been sent to ${cleanEmail}. Please check your inbox and click the verification button to activate your account before signing in.`,
      user: { id: user.id, email: user.email, name: cleanName },
      requiresVerification: true,
      ...includeVerificationLink(actionLink)
    });


  } catch (error) {
    console.error("Register Router Exception:", error);
    response.status(500).json({ error: error?.message || "Registration failed on server" });
  }
});

// 1b. Resend Email Verification Link
authRouter.post("/resend-verification", authRateLimiter, async (request, response) => {
  try {
    const { email } = request.body;
    if (!email) {
      return response.status(400).json({ error: "Email address is required" });
    }

    const cleanEmail = normalizeEmail(email);

    let redirectTo = request.headers.origin || "http://localhost:5173";
    if (!redirectTo.endsWith("/")) {
      redirectTo += "/";
    }

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: cleanEmail,
      options: { emailRedirectTo: redirectTo }
    });

    if (error) {
      return response.status(400).json({ error: error.message });
    }

    response.json({
      message: `A new verification email has been sent to ${cleanEmail}. Please check your inbox.`
    });
  } catch (error) {
    console.error("Resend Verification Error:", error);
    response.status(500).json({ error: "Failed to resend verification email" });
  }
});




// 2. User Sign In (Login)
authRouter.post("/login", authRateLimiter, async (request, response) => {
  try {
    const { email, password } = request.body;
    if (!email || !password) {
      return response.status(400).json({ error: "Email and password are required" });
    }

    // Authenticate credentials
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return response.status(400).json({ error: error.message });
    }

    const user = data.user;

    // Check if email has been verified via Supabase Admin API
    let isConfirmed = false;
    try {
      const { data: adminUserRes } = await supabaseAdmin.auth.admin.getUserById(user.id);
      if (adminUserRes?.user?.email_confirmed_at) {
        isConfirmed = true;
      }
    } catch (_) {
      isConfirmed = !!(user.email_confirmed_at || user.confirmed_at);
    }
    
    // Retrieve user profile role and organization details
    let profile = null;
    let { data: profileWithOrg, error: profileError } = await supabase
      .from("profiles")
      .select("*, organization:organizations(*)")
      .eq("id", user.id)
      .single();

    if (profileError || !profileWithOrg) {
      const { data: simpleProfile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      profile = simpleProfile;
    } else {
      profile = profileWithOrg;
    }

    if (!profile) {
      return response.status(401).json({ error: "User profile record missing" });
    }

    // Enforce email verification check
    if (!isConfirmed || profile.status === "pending_verification" || profile.email_verified === false) {
      if (isConfirmed) {
        // User HAS clicked the email verification link in their email! Promote profile status to active!
        try {
          await supabase
            .from("profiles")
            .update({ status: "active", email_verified: true })
            .eq("id", user.id);
          profile.status = "active";
          profile.email_verified = true;
        } catch (_) {}
      } else {
        // User HAS NOT clicked the email verification link! Strictly block sign in!
        await supabase.auth.signOut();
        return response.status(403).json({ 
          error: `Email verification required: A confirmation link was sent to ${user.email}. Please check your inbox and click the verification button to verify your account before logging in.` 
        });
      }
    }


    if (!profile) {
      return response.status(401).json({ error: "User profile record missing" });
    }

    if (profile.status === "suspended") {
      return response.status(403).json({ error: "Your account is suspended. Contact workspace administrator." });
    }

    if (profile.organization && profile.organization.status === "suspended") {
      return response.status(403).json({ error: "Your workspace has been suspended. Contact VerboLabs support." });
    }

    // Enforce workspace boundary: Resolve space membership from user_tenant_memberships or profile
    const activeTenantId = request.tenant?.id;
    const activeSpaceName = request.tenant?.name || "this";
    const activeSubdomain = request.tenant?.subdomain || "centroid";
    const isSuperAdmin = profile.role === "super_admin";

    if (!isSuperAdmin && activeTenantId) {
      let membership = null;

      try {
        const { data: memData } = await supabase
          .from("user_tenant_memberships")
          .select("*")
          .eq("user_id", user.id)
          .eq("organization_id", activeTenantId)
          .maybeSingle();

        membership = memData;
      } catch (_) {}

      if (membership) {
        // Space-specific membership found — use its role/credits for this workspace
        profile = {
          ...profile,
          role: membership.role || profile.role,
          organization_id: activeTenantId,
          credits_allowed: membership.credits_allowed ?? profile.credits_allowed,
          credits_consumed: membership.credits_consumed ?? profile.credits_consumed,
          has_translate_access: membership.has_translate_access ?? profile.has_translate_access,
          status: membership.status || profile.status
        };
      } else if (profile.organization_id === activeTenantId) {
        // Profile belongs directly to this workspace
      } else {
        // No account registered for this workspace — reject login
        await supabase.auth.signOut();
        return response.status(403).json({
          error: `No account found for '${activeSpaceName}' workspace. Please register an account on this workspace URL first.`
        });
      }
    }

    response.json({
      message: "Login successful",
      token: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: Date.now() + (data.session.expires_in || 3600) * 1000,
      user: {
        id: user.id,
        email: user.email,
        name: profile.name || profile.full_name || user.user_metadata?.name || user.user_metadata?.full_name || user.email?.split("@")[0],
        role: profile.role,
        hasTranslateAccess: profile.has_translate_access,
        creditsAllowed: profile.credits_allowed,
        creditsConsumed: profile.credits_consumed,
        status: profile.status,
        organizationId: profile.organization_id || null,
        organization: profile.organization || null
      }
    });

  } catch (error) {
    console.error("Login Router Error:", error);
    response.status(500).json({ error: "Authentication failed on server" });
  }
});

// 2b. Silent Session Token Refresh
authRouter.post("/refresh", async (request, response) => {
  try {
    const { refreshToken } = request.body;
    if (!refreshToken) {
      return response.status(400).json({ error: "Refresh token is required" });
    }

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken
    });

    if (error) {
      return response.status(401).json({ error: error.message });
    }

    const user = data.user;
    let profile = null;
    let { data: profileWithOrg, error: profileError } = await supabase
      .from("profiles")
      .select("*, organization:organizations(*)")
      .eq("id", user.id)
      .single();

    if (profileError || !profileWithOrg) {
      const { data: simpleProfile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      profile = simpleProfile;
    } else {
      profile = profileWithOrg;
    }

    if (!profile) {
      return response.status(401).json({ error: "User profile record missing" });
    }

    if (profile.status === "suspended") {
      return response.status(403).json({ error: "Your account is suspended. Contact VerboLabs." });
    }

    if (profile.organization && profile.organization.status === "suspended") {
      return response.status(403).json({ error: "Your space workspace has been suspended. Contact VerboLabs." });
    }

    response.json({
      message: "Session refreshed successfully",
      token: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: Date.now() + (data.session.expires_in || 3600) * 1000,
      user: {
        id: user.id,
        email: user.email,
        role: profile.role,
        hasTranslateAccess: profile.has_translate_access,
        creditsAllowed: profile.credits_allowed,
        creditsConsumed: profile.credits_consumed,
        status: profile.status,
        organizationId: profile.organization_id,
        organization: profile.organization
      }
    });
  } catch (error) {
    console.error("Token Refresh Error:", error);
    response.status(500).json({ error: "Token refresh failed on server" });
  }
});

// Simple in-memory rate limiter for password reset emails
const emailLimits = new Map(); // key: email -> timestamp
const ipLimits = new Map();    // key: IP -> timestamp
const LIMIT_WINDOW_MS = 2 * 60 * 1000; // 2 minutes rate limit

// 3. Request Password Reset (Forgot Password)
authRouter.post("/forgot-password", async (request, response) => {
  try {
    const { email } = request.body;
    if (!email) {
      return response.status(400).json({ error: "Email address is required" });
    }

    // Rate Limiting Checks
    const clientIp = request.ip || request.headers['x-forwarded-for'] || request.socket.remoteAddress;

    // Check IP rate limit
    if (clientIp) {
      const lastIpSent = ipLimits.get(clientIp);
      if (lastIpSent && Date.now() - lastIpSent < LIMIT_WINDOW_MS) {
        const remainingSec = Math.ceil((LIMIT_WINDOW_MS - (Date.now() - lastIpSent)) / 1000);
        return response.status(429).json({ 
          error: `Too many password reset requests from this IP. Please wait ${remainingSec} seconds.` 
        });
      }
    }

    // Check Email rate limit
    const lastEmailSent = emailLimits.get(email.toLowerCase());
    if (lastEmailSent && Date.now() - lastEmailSent < LIMIT_WINDOW_MS) {
      const remainingSec = Math.ceil((LIMIT_WINDOW_MS - (Date.now() - lastEmailSent)) / 1000);
      return response.status(429).json({ 
        error: `A password reset email was recently sent to this address. Please wait ${remainingSec} seconds.` 
      });
    }

    // Check if the user exists in profiles table
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (profileErr) {
      console.error("Forgot Password Check Error:", profileErr);
      return response.status(500).json({ error: "Database verification failed" });
    }

    if (!profile) {
      return response.status(404).json({ error: "No account found with this email address." });
    }

    let redirectTo = request.headers.origin || "http://localhost:5173";
    if (!redirectTo.endsWith("/")) {
      redirectTo += "/";
    }
    const referer = request.headers.referer;
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        if (refererUrl.pathname.startsWith("/client")) {
          redirectTo = `${refererUrl.origin}/client/`;
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }

    // Supabase reset password email delivery
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo
    });

    if (error) {
      return response.status(400).json({ error: error.message });
    }

    // Update rate limit timestamps on success
    if (clientIp) {
      ipLimits.set(clientIp, Date.now());
    }
    emailLimits.set(email.toLowerCase(), Date.now());

    response.json({
      message: "Password reset link sent! Please check your email inbox."
    });
  } catch (error) {
    console.error("Forgot Password Error:", error);
    response.status(500).json({ error: "Password reset request failed on server" });
  }
});

// 4. Reset Password (Authenticated via JWT recovery token)
authRouter.post("/reset-password", async (request, response) => {
  try {
    const { password } = request.body;
    if (!password) {
      return response.status(400).json({ error: "New password is required" });
    }
    const secError = validatePasswordSecurity(password);
    if (secError) {
      return response.status(400).json({ error: secError });
    }


    // Extract Bearer token
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return response.status(401).json({ error: "Missing or malformed Authorization header" });
    }
    const token = authHeader.split(" ")[1];

    // Verify token with Supabase Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return response.status(401).json({ error: "Invalid or expired session/recovery token" });
    }

    // Create a temporary client authenticated as the user using their token
    const { createClient } = require("@supabase/supabase-js");
    const userSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    // Set the session using the recovery token
    const { error: sessionError } = await userSupabase.auth.setSession({
      access_token: token,
      refresh_token: token
    });

    if (sessionError) {
      return response.status(401).json({ error: "Failed to establish user auth session" });
    }

    // Update the password using the user-level client
    const { error } = await userSupabase.auth.updateUser({
      password
    });

    if (error) {
      return response.status(400).json({ error: error.message });
    }

    response.json({
      message: "Your password has been successfully reset! You can now log in."
    });
  } catch (error) {
    console.error("Reset Password Error:", error);
    response.status(500).json({ error: "Failed to reset password on server" });
  }
});

// 5. Fetch Active Session User Profile
authRouter.get("/me", checkAuth, async (request, response) => {
  try {
    const profile = request.profile;
    response.json({
      id: profile.id,
      email: profile.email,
      name: profile.name || profile.full_name || request.user?.user_metadata?.name || request.user?.user_metadata?.full_name || profile.email?.split("@")[0],
      role: profile.role,
      hasTranslateAccess: profile.has_translate_access,
      creditsAllowed: profile.credits_allowed,
      creditsConsumed: profile.credits_consumed,
      status: profile.status,
      organizationId: request.tenant_id || profile.organization_id,
      organization: request.tenant || profile.organization
    });
  } catch (error) {
    console.error("Get Session Profile Error:", error);

    response.status(500).json({ error: "Could not fetch user session profile" });
  }
});


// 6. List User's Joined Spaces
authRouter.get("/my-spaces", checkAuth, async (request, response) => {
  try {
    const userId = request.user.id;
    const isSuperAdmin = request.profile?.role === "super_admin";

    if (isSuperAdmin) {
      // Super Admin sees all spaces
      const { data: orgs } = await supabase
        .from("organizations")
        .select("id, name, subdomain, status")
        .order("name", { ascending: true });
      return response.json({ spaces: orgs || [] });
    }

    // Fetch user memberships from user_tenant_memberships
    let mems = null;
    try {
      const { data } = await supabase
        .from("user_tenant_memberships")
        .select("organization_id, role, status, organization:organizations(*)")
        .eq("user_id", userId);
      mems = data;
    } catch (_) {}

    const spaceMap = new Map();
    if (mems) {
      mems.forEach(m => {
        if (m.organization) {
          spaceMap.set(m.organization.id, {
            id: m.organization.id,
            name: m.organization.name,
            subdomain: m.organization.subdomain,
            role: m.role,
            status: m.status
          });
        }
      });
    }

    // Also check primary organization profile
    if (request.profile?.organization_id) {
      const orgId = request.profile.organization_id;
      if (!spaceMap.has(orgId)) {
        const { data: mainOrg } = await supabase
          .from("organizations")
          .select("id, name, subdomain, status")
          .eq("id", orgId)
          .maybeSingle();
        if (mainOrg) {
          spaceMap.set(mainOrg.id, {
            ...mainOrg,
            role: request.profile.role,
            status: request.profile.status
          });
        }
      }
    }

    // Always include default master space for logged in users
    const { data: defaultOrg } = await supabase
      .from("organizations")
      .select("id, name, subdomain, status")
      .in("subdomain", ["centroid", "verbolabs"])
      .limit(1)
      .maybeSingle();
    if (defaultOrg && !spaceMap.has(defaultOrg.id)) {
      spaceMap.set(defaultOrg.id, { ...defaultOrg, role: "linguist", status: "active" });
    }

    response.json({ spaces: Array.from(spaceMap.values()) });
  } catch (error) {
    console.error("List User Spaces Error:", error);
    response.status(500).json({ error: "Failed to list joined spaces" });
  }
});

// 7. Join Active Space (1-click space membership for logged-in or existing user)
authRouter.post("/join-space", checkAuth, async (request, response) => {
  try {
    const userId = request.user.id;
    const activeTenantId = request.tenant?.id;
    const spaceSlug = request.body.spaceSlug || request.tenant?.subdomain;

    if (!activeTenantId && !spaceSlug) {
      return response.status(400).json({ error: "Target space is required" });
    }

    let targetOrg = request.tenant;
    if (!targetOrg && spaceSlug) {
      const { data: org } = await supabase
        .from("organizations")
        .select("*")
        .eq("subdomain", spaceSlug.toLowerCase().trim())
        .maybeSingle();
      targetOrg = org;
    }

    if (!targetOrg) {
      return response.status(404).json({ error: `Space '${spaceSlug}' not found.` });
    }

    // Upsert membership in user_tenant_memberships
    try {
      await supabase
        .from("user_tenant_memberships")
        .upsert({
          user_id: userId,
          organization_id: targetOrg.id,
          role: "linguist",
          credits_allowed: 50000,
          status: "active"
        }, { onConflict: "user_id,organization_id" });
    } catch (dbErr) {
      console.warn("Membership upsert warning:", dbErr?.message);
    }

    response.json({
      message: `Successfully joined ${targetOrg.name} space!`,
      space: {
        id: targetOrg.id,
        name: targetOrg.name,
        subdomain: targetOrg.subdomain
      }
    });
  } catch (error) {
    console.error("Join Space Error:", error);
    response.status(500).json({ error: "Failed to join space" });
  }
});

// User Search Endpoint for Share Modals
authRouter.get("/users/search", checkAuth, async (request, response) => {
  try {
    const queryStr = String(request.query.query || "").trim().toLowerCase();
    if (!queryStr || queryStr.length < 1) {
      return response.json({ users: [] });
    }

    const { data: users, error } = await supabase
      .from("profiles")
      .select("id, email, role")
      .ilike("email", `%${queryStr}%`)
      .limit(10);

    if (error) {
      console.error("[USER_SEARCH_ERROR]", error);
      return response.json({ users: [] });
    }

    response.json({ users: users || [] });
  } catch (error) {
    console.error("User Search Error:", error);
    response.json({ users: [] });
  }
});

module.exports = {
  authRouter
};

