const fs = require("fs");
const { supabase } = require("../config/supabase");

// Helper to count words in source segments
function countWordsInSegments(segments) {
  if (!segments || !Array.isArray(segments)) return 0;
  let count = 0;
  segments.forEach(seg => {
    if (!seg.source) return;
    const clean = seg.source
      .replace(/<[^>]+>/g, "") // Strip HTML tags
      .replace(/__TAG_\d+__/g, "") // Strip placeholders
      .trim();
    if (clean) {
      count += clean.split(/\s+/).filter(w => w.length > 0).length;
    }
  });
  return count;
}

// Helper to clean up uploaded file if auth fails
function cleanupUploadedFile(request) {
  if (request.file && request.file.path) {
    try {
      if (fs.existsSync(request.file.path)) fs.unlinkSync(request.file.path);
    } catch (_) {}
  }
}

// 1. Verify User Session & Status
async function checkAuth(request, response, next) {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      cleanupUploadedFile(request);
      return response.status(401).json({ error: "Missing authorization token" });
    }

    const token = authHeader.split(" ")[1];
    
    // Verify the JWT with Supabase Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      cleanupUploadedFile(request);
      return response.status(401).json({ error: "Invalid or expired session token" });
    }

    // Check if email has been verified/confirmed
    const isConfirmed = user.email_confirmed_at || user.confirmed_at;
    if (!isConfirmed) {
      return response.status(403).json({ error: "Please verify your email address before logging in." });
    }

    // Retrieve custom profile information from public.profiles
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
      return response.status(401).json({ error: "User profile not found in database" });
    }

    if (profile.status === "suspended") {
      return response.status(403).json({ error: "Your account has been suspended. Please contact VerboLabs support." });
    }

    if (profile.organization && profile.organization.status === "suspended") {
      return response.status(403).json({ error: "Your workspace space has been suspended. Please contact VerboLabs support." });
    }

    // Cross-workspace restriction: regular users & client admins can only access their assigned space
    const isSuperAdmin = profile.role === "super_admin";
    const activeSubdomain = request.tenant?.subdomain || "centroid";
    const isMainSpace = ["centroid", "verbolabs"].includes(activeSubdomain.toLowerCase());

    if (!isSuperAdmin && !isMainSpace && request.tenant?.id && profile.organization_id) {
      if (profile.organization_id !== request.tenant.id) {
        return response.status(403).json({
          error: "Access denied. Your account is registered under another space organization. Please log in at your assigned space URL."
        });
      }
    }

    // Attach user credentials and roles to request
    request.user = user;
    request.profile = profile;
    request.organization = request.tenant || profile.organization || null;
    
    next();
  } catch (err) {
    console.error("Auth Middleware Error:", err);
    return response.status(500).json({ error: "Server authentication error" });
  }
}

// 2. Validate Translation Access & Word Credits
async function checkTranslateAccess(request, response, next) {
  try {
    const profile = request.profile;
    
    if (!profile.has_translate_access) {
      return response.status(403).json({ error: "Your translation access has been disabled by the administrator." });
    }

    // Count words in translation batch request
    const wordCount = countWordsInSegments(request.body.segments);

    // Bypass check for super_admin
    if (profile.role !== "super_admin") {
      // Check user individual credit limits for standard users
      if (profile.role !== "admin") {
        if (profile.credits_consumed + wordCount > profile.credits_allowed) {
          return response.status(403).json({ 
            error: `Credit limit exceeded. Reached ${profile.credits_consumed}/${profile.credits_allowed} words allowance. Contact space admin.` 
          });
        }
      }

      // Check overall organization credit limit
      const org = request.organization || profile.organization;
      if (org && org.credits_allowed > 0) {
        if (org.credits_consumed + wordCount > org.credits_allowed) {
          return response.status(403).json({
            error: `Workspace credit limit exceeded for ${org.name}. Reached ${org.credits_consumed}/${org.credits_allowed} words allowance. Contact VerboLabs.`
          });
        }
      }
    }

    request.wordCount = wordCount;
    next();
  } catch (err) {
    console.error("Translate Access Middleware Error:", err);
    return response.status(500).json({ error: "Translation permission check failed" });
  }
}

// 3. Admin / Manager Role Guards
function checkRole(allowedRoles) {
  return (request, response, next) => {
    const role = request.profile?.role;
    // super_admin always passes admin checks
    if (role === "super_admin" || allowedRoles.includes(role)) {
      return next();
    }
    return response.status(403).json({ error: "Access denied. Insufficient permissions." });
  };
}

module.exports = {
  checkAuth,
  checkTranslateAccess,
  checkRole
};
