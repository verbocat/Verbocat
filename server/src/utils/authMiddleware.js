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

// 1. Verify User Session & Status
async function checkAuth(request, response, next) {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return response.status(401).json({ error: "Missing authorization token" });
    }

    const token = authHeader.split(" ")[1];
    
    // Verify the JWT with Supabase Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return response.status(401).json({ error: "Invalid or expired session token" });
    }

    // Check if email has been verified/confirmed
    const isConfirmed = user.email_confirmed_at || user.confirmed_at;
    if (!isConfirmed) {
      return response.status(403).json({ error: "Please verify your email address before logging in." });
    }

    // Retrieve custom profile information from public.profiles
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return response.status(401).json({ error: "User profile not found in database" });
    }

    if (profile.status === "suspended") {
      return response.status(403).json({ error: "Your account has been suspended. Please contact VerboLabs support." });
    }

    // Attach user credentials and roles to request
    request.user = user;
    request.profile = profile;
    
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
    
    // Check credit limits (bypass word count block for Admins)
    if (profile.role !== "admin") {
      if (profile.credits_consumed + wordCount > profile.credits_allowed) {
        return response.status(403).json({ 
          error: `Credit limit exceeded. Reached ${profile.credits_consumed}/${profile.credits_allowed} words allowance. Contact admin.` 
        });
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
    const role = request.profile.role;
    if (!allowedRoles.includes(role)) {
      return response.status(403).json({ error: "Access denied. Insufficient permissions." });
    }
    next();
  };
}

module.exports = {
  checkAuth,
  checkTranslateAccess,
  checkRole
};
