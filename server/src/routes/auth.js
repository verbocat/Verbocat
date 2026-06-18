const express = require("express");
const { supabase } = require("../config/supabase");
const { checkAuth } = require("../utils/authMiddleware");

const authRouter = express.Router();

// 1. User Account Registration
authRouter.post("/register", async (request, response) => {
  try {
    const { email, password } = request.body;
    if (!email || !password) {
      return response.status(400).json({ error: "Email and password are required" });
    }

    // Call Supabase signup (triggers verification email by default)
    const redirectTo = `${request.headers.origin || "http://localhost:5173"}/`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo
      }
    });

    if (error) {
      console.error("Supabase Signup Error Details:", error);
      return response.status(400).json({ 
        error: error.message || "Email confirmation mail could not be sent. Please check SMTP settings." 
      });
    }

    response.json({
      message: "Registration successful! Please check your email inbox to verify your account.",
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

// 3. Request Password Reset (Forgot Password)
authRouter.post("/forgot-password", async (request, response) => {
  try {
    const { email } = request.body;
    if (!email) {
      return response.status(400).json({ error: "Email address is required" });
    }

    const redirectTo = `${request.headers.origin}/reset-password`;

    // Supabase reset password email delivery
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo
    });

    if (error) {
      return response.status(400).json({ error: error.message });
    }

    response.json({
      message: "Password reset link sent! Please check your email inbox."
    });
  } catch (error) {
    console.error("Forgot Password Error:", error);
    response.status(500).json({ error: "Password reset request failed on server" });
  }
});

// 4. Reset Password (Authenticated via JWT recovery token)
authRouter.post("/reset-password", checkAuth, async (request, response) => {
  try {
    const { password } = request.body;
    if (!password) {
      return response.status(400).json({ error: "New password is required" });
    }
    if (password.length < 6) {
      return response.status(400).json({ error: "Password must be at least 6 characters long" });
    }

    const userId = request.user.id;

    // Update the password in Supabase Auth using admin privileges
    const { error } = await supabase.auth.admin.updateUserById(userId, {
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
