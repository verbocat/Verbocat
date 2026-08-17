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

    // Resolve space-specific membership from user_tenant_memberships
    const activeTenantId = request.tenant_id || request.tenant?.id;
    const activeSpaceName = request.tenant?.name || "this";
    const activeSubdomain = request.tenant?.subdomain || "centroid";
    const isSuperAdmin = profile.role === "super_admin";
    const isMainSpace = ["centroid", "verbolabs"].includes(activeSubdomain.toLowerCase());

    if (!isSuperAdmin && !isMainSpace && activeTenantId) {
      let membership = null;
      let tableExists = true;

      try {
        const { data: memData, error: memError } = await supabase
          .from("user_tenant_memberships")
          .select("*")
          .eq("user_id", user.id)
          .eq("organization_id", activeTenantId)
          .maybeSingle();

        if (memError && (memError.code === "42P01" || memError.message?.includes("does not exist"))) {
          tableExists = false;
        } else {
          membership = memData;
        }
      } catch (_) {
        tableExists = false;
      }

      if (membership) {
        // Space-specific membership found — use its role/credits for this space
        profile = {
          ...profile,
          role: membership.role || profile.role,
          organization_id: activeTenantId,
          credits_allowed: membership.credits_allowed ?? profile.credits_allowed,
          credits_consumed: membership.credits_consumed ?? profile.credits_consumed,
          has_translate_access: membership.has_translate_access ?? profile.has_translate_access,
          status: membership.status || profile.status
        };
      } else if (!tableExists || !profile.organization_id || profile.organization_id === activeTenantId) {
        // Table doesn't exist yet, or user's primary profile belongs to this space — allow access
      } else {
        // No membership found and profile belongs to a different space — block
        return response.status(403).json({
          error: `You are not registered in the '${activeSpaceName}' space. To join this space, go to https://centroid.verbolabs.com/?space=${activeSubdomain} and click Sign Up.`
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

/**
 * 4. Verifies if a user has access/permission to view or edit a document.
 * Returns { hasAccess: boolean, permission: "read" | "write" | null, document: object | null }
 */
async function getDocumentPermission(documentId, user, profile, tenantId = null) {
  if (!documentId || !user || !profile) {
    return { hasAccess: false, permission: null, document: null };
  }

  // 1. Fetch document record
  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .single();

  if (docErr || !doc) {
    return { hasAccess: false, permission: null, document: null };
  }

  const role = profile.role || "";
  const userId = user.id;
  const isSuperAdmin = role === "super_admin";
  const userOrgId = tenantId || profile.organization_id || null;

  // STRICT MULTI-TENANT ISOLATION:
  // If the document belongs to a specific organization space and user is not super_admin, block cross-tenant access!
  if (!isSuperAdmin && doc.organization_id && userOrgId && doc.organization_id !== userOrgId) {
    return { hasAccess: false, permission: null, document: doc };
  }

  // 2. Super admin, Admin, Project Manager, or VerboLabs Staff on same workspace have full write access
  const isStaffOrAdmin = ["super_admin", "admin", "project_manager", "verbolabs_staff"].includes(role);
  if (isStaffOrAdmin) {
    return { hasAccess: true, permission: "write", document: doc };
  }

  // 3. Document Owner has full write access
  if (doc.owner_id === userId) {
    return { hasAccess: true, permission: "write", document: doc };
  }

  // 4. Project Owner (if document belongs to a project) has full write access
  if (doc.project_id) {
    try {
      const { data: proj } = await supabase
        .from("projects")
        .select("owner_id, organization_id")
        .eq("id", doc.project_id)
        .single();

      if (proj) {
        if (!isSuperAdmin && proj.organization_id && userOrgId && proj.organization_id !== userOrgId) {
          return { hasAccess: false, permission: null, document: doc };
        }
        if (proj.owner_id === userId) {
          return { hasAccess: true, permission: "write", document: doc };
        }
      }
    } catch (_) {}
  }

  // 5. Check explicit permission entry in `document_access` table
  try {
    const { data: accessRow } = await supabase
      .from("document_access")
      .select("permission")
      .eq("document_id", documentId)
      .eq("user_id", userId)
      .maybeSingle();

    if (accessRow) {
      const perm = accessRow.permission === "read" ? "read" : "write";
      return { hasAccess: true, permission: perm, document: doc };
    }
  } catch (_) {}

  // 6. Check if assigned to any job for this document in `translation_jobs` table
  try {
    const { data: jobAssignment } = await supabase
      .from("translation_jobs")
      .select("id")
      .eq("document_id", documentId)
      .or(`translator_id.eq.${userId},assignee_id.eq.${userId}`)
      .limit(1);

    if (jobAssignment && jobAssignment.length > 0) {
      return { hasAccess: true, permission: "write", document: doc };
    }
  } catch (_) {}

  // 7. No matching permission found -> ACCESS DENIED
  return { hasAccess: false, permission: null, document: doc };
}

/**
 * Middleware wrapper that enforces document read/write access on Express routes
 */
function checkDocumentAccess({ requiredPermission = "read" } = {}) {
  return async (request, response, next) => {
    try {
      const documentId = request.params.id || request.params.documentId || request.body.documentId || request.query.documentId;
      if (!documentId) {
        return next();
      }

      const activeTenantId = request.tenant?.id || request.profile?.organization_id;
      const access = await getDocumentPermission(documentId, request.user, request.profile, activeTenantId);
      if (!access.hasAccess) {
        return response.status(403).json({
          error: "Access Denied: You do not have permission to access this document workspace. Please request access from the owner or administrator to participate."
        });
      }

      if (requiredPermission === "write" && access.permission !== "write") {
        return response.status(403).json({
          error: "Access Denied: You have Read-Only access to this document and cannot modify its segments."
        });
      }

      request.documentAccess = access;
      next();
    } catch (err) {
      console.error("Check Document Access Error:", err);
      return response.status(500).json({ error: "Failed to verify document permissions" });
    }
  };
}

module.exports = {
  checkAuth,
  checkTranslateAccess,
  checkRole,
  getDocumentPermission,
  checkDocumentAccess
};
