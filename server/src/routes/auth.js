const express = require("express");
const { supabase, supabaseAdmin } = require("../config/supabase");
const { checkAuth } = require("../utils/authMiddleware");

const authRouter = express.Router();

// 1. User Account Registration
authRouter.post("/register", async (request, response) => {
  try {
    const { email, password } = request.body;
    if (!email || !password) {
      return response.status(400).json({ error: "Email and password are required" });
    }

    // Call Supabase admin createUser to auto-verify email and avoid verification delays
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (error) {
      console.error("Supabase Admin Create User Error:");
      console.error(JSON.stringify(error, null, 2));
      return response.status(400).json({
        error: error.message,
        code: error.code,
        details: error
      });
    }

    response.json({
      message: "Registration successful! Your account is automatically verified and ready for login.",
      user: data.user
    });
  } catch (error) {
    console.error("Register Router Exception:", error);
    response.status(500).json({ error: "Registration failed on server" });
  }
});

// 2. User Sign In (Login)
authRouter.post("/login", async (request, response) => {
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
    
    // Check if email has been verified
    const isConfirmed = user.email_confirmed_at || user.confirmed_at;
    if (!isConfirmed) {
      // Sign out immediately if not confirmed
      await supabase.auth.signOut();
      return response.status(403).json({ 
        error: "Please confirm your email address. A verification link has been sent to your inbox." 
      });
    }

    // Retrieve user profile role
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return response.status(401).json({ error: "User profile record missing" });
    }

    if (profile.status === "suspended") {
      return response.status(403).json({ error: "Your account is suspended. Contact VerboLabs." });
    }

    response.json({
      message: "Login successful",
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
        status: profile.status
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
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return response.status(401).json({ error: "User profile record missing" });
    }

    if (profile.status === "suspended") {
      return response.status(403).json({ error: "Your account is suspended. Contact VerboLabs." });
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
        status: profile.status
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
    if (password.length < 6) {
      return response.status(400).json({ error: "Password must be at least 6 characters long" });
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
      role: profile.role,
      hasTranslateAccess: profile.has_translate_access,
      creditsAllowed: profile.credits_allowed,
      creditsConsumed: profile.credits_consumed,
      status: profile.status
    });
  } catch (error) {
    console.error("Get Session Profile Error:", error);

    response.status(500).json({ error: "Could not fetch user session profile" });
  }
});

module.exports = {
  authRouter
};
