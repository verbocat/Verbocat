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

    const tenantId = request.tenant?.id;
    const cleanEmail = email.toLowerCase().trim();

    // Check if user already exists in Supabase Auth
    let existingUser = null;
    try {
      const { data: authData } = await supabaseAdmin.auth.admin.listUsers();
      if (authData?.users) {
        existingUser = authData.users.find(u => u.email?.toLowerCase() === cleanEmail);
      }
    } catch (_) {}

    if (existingUser) {
      // User already exists in Supabase Auth. Verify password before adding membership for this space
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password
      });

      if (loginError) {
        return response.status(400).json({
          error: `An account with this email address already exists. Please enter your correct password to join the '${request.tenant?.name || 'requested'}' space.`
        });
      }

      // Password is valid! Add membership to user_tenant_memberships for this tenantId
      if (tenantId) {
        try {
          await supabase
            .from("user_tenant_memberships")
            .upsert({
              user_id: existingUser.id,
              organization_id: tenantId,
              role: "linguist",
              credits_allowed: 50000,
              status: "active"
            }, { onConflict: "user_id,organization_id" });
        } catch (_) {}
      }

      return response.json({
        message: `Registration successful! Your account is now added to '${request.tenant?.name || 'this'}' space. You can now log in.`,
        user: loginData.user
      });
    }

    // Call Supabase admin createUser for new user
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true
    });

    if (error) {
      return response.status(400).json({ error: error.message });
    }

    const user = data.user;

    if (user && tenantId) {
      // Upsert base profile
      await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          email: user.email,
          role: "linguist",
          organization_id: tenantId,
          credits_allowed: 50000,
          status: "active"
        }, { onConflict: "id" });

      // Upsert space membership
      try {
        await supabase
          .from("user_tenant_memberships")
          .upsert({
            user_id: user.id,
            organization_id: tenantId,
            role: "linguist",
            credits_allowed: 50000,
            status: "active"
          }, { onConflict: "user_id,organization_id" });
      } catch (_) {}
    }

    response.json({
      message: "Registration successful! Your account is ready for login.",
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

    if (profile.status === "suspended") {
      return response.status(403).json({ error: "Your account is suspended. Contact VerboLabs." });
    }

    if (profile.organization && profile.organization.status === "suspended") {
      return response.status(403).json({ error: "Your space workspace has been suspended. Contact VerboLabs." });
    }

    // Enforce workspace boundary: Resolve space membership from user_tenant_memberships
    const activeTenantId = request.tenant?.id;
    const isSuperAdmin = profile.role === "super_admin";
    const activeSubdomain = request.tenant?.subdomain || "centroid";
    const isMainSpace = ["centroid", "verbolabs"].includes(activeSubdomain.toLowerCase());

    if (!isSuperAdmin && !isMainSpace && activeTenantId) {
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
        profile = {
          ...profile,
          role: membership.role || profile.role,
          organization_id: activeTenantId,
          credits_allowed: membership.credits_allowed ?? profile.credits_allowed,
          credits_consumed: membership.credits_consumed ?? profile.credits_consumed,
          has_translate_access: membership.has_translate_access ?? profile.has_translate_access,
          status: membership.status || profile.status
        };
      } else if (!profile.organization_id || profile.organization_id === activeTenantId) {
        // Direct legacy profile match
      } else {
        await supabase.auth.signOut();
        return response.status(403).json({
          error: `You are not registered in the '${request.tenant?.name || activeSubdomain}' space. Please sign up at https://centroid.verbolabs.com/?space=${activeSubdomain} to join this space with your account.`
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

module.exports = {
  authRouter
};
