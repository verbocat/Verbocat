const crypto = require("crypto");
const { supabase } = require("../config/supabase");
const { checkAuth } = require("../utils/authMiddleware");

/**
 * Hash raw API key string using SHA-256 for secure database lookup
 */
function hashApiKey(rawKey) {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

/**
 * Generate a new API Key string and its SHA-256 hash
 * Format: vb_live_<32_char_hex>
 */
function generateApiKey() {
  const randomBytes = crypto.randomBytes(16).toString("hex");
  const rawKey = `vb_live_${randomBytes}`;
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = rawKey.substring(0, 12);
  return { rawKey, keyHash, keyPrefix };
}

/**
 * Middleware: Verify API Key or Bearer Token authentication for Public API routes
 */
async function apiKeyAuth(req, res, next) {
  try {
    // 1. Extract API key from headers or query params
    let apiKey = req.headers["x-api-key"] || req.query.api_key;
    const authHeader = req.headers.authorization;

    if (!apiKey && authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      // Check if bearer token is an API key (starts with vb_) or a JWT token
      if (token.startsWith("vb_")) {
        apiKey = token;
      } else {
        // Fall back to standard JWT auth middleware
        return checkAuth(req, res, next);
      }
    }

    if (!apiKey) {
      return res.status(401).json({
        error: "Unauthorized: Missing API key. Provide via 'x-api-key' header or 'Authorization: Bearer <API_KEY>'."
      });
    }

    // 2. Check environment master fallback API key (if set)
    const masterApiKey = process.env.PUBLIC_API_KEY || process.env.VERBOCAT_API_KEY;
    if (masterApiKey && apiKey === masterApiKey) {
      // Fetch a valid system admin user ID from database to pass Foreign Key checks
      let adminId = "d02d37ba-90d1-4147-bf8f-1687d66500d5";
      try {
        const { data: firstAdmin } = await supabase.from("profiles").select("id, organization_id").limit(1).single();
        if (firstAdmin?.id) adminId = firstAdmin.id;
      } catch (_) {}

      req.user = { id: adminId, email: "api-service@verbocat.local" };
      req.profile = {
        id: adminId,
        role: "super_admin",
        credits_allowed: 99999999,
        credits_consumed: 0,
        has_translate_access: true,
        status: "active"
      };
      req.organization = null;
      return next();
    }

    // 3. Hash input key and query database `api_keys` table
    const keyHash = hashApiKey(apiKey);

    const { data: keyRecord, error: keyError } = await supabase
      .from("api_keys")
      .select("*")
      .eq("key_hash", keyHash)
      .eq("status", "active")
      .maybeSingle();

    if (keyError || !keyRecord) {
      return res.status(401).json({ error: "Unauthorized: Invalid or revoked API key." });
    }

    // 4. Update last_used_at timestamp asynchronously
    supabase
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", keyRecord.id)
      .then(() => {})
      .catch((err) => console.error("Failed to update API key last_used_at:", err));

    // 5. Hydrate user and profile context from key owner
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("*, organization:organizations(*)")
      .eq("id", keyRecord.user_id)
      .single();

    if (profileErr || !profile) {
      // Create lightweight fallback user context if profile query yields no row
      req.user = { id: keyRecord.user_id };
      req.profile = {
        id: keyRecord.user_id,
        role: "admin",
        credits_allowed: 999999,
        credits_consumed: 0,
        has_translate_access: true,
        status: "active",
        organization_id: keyRecord.organization_id || null
      };
    } else {
      req.user = { id: profile.id, email: profile.email };
      req.profile = profile;
      req.organization = profile.organization || null;
    }

    return next();
  } catch (err) {
    console.error("API Key Auth Error:", err);
    return res.status(500).json({ error: "Authentication server error." });
  }
}

module.exports = {
  apiKeyAuth,
  hashApiKey,
  generateApiKey
};
