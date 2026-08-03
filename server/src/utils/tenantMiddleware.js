const { supabase } = require("../config/supabase");

// Cache organizations for fast lookup (TTL: 60 seconds)
const orgCache = new Map();
const CACHE_TTL = 60 * 1000;

async function getOrganizationBySubdomain(subdomain) {
  const cleanSubdomain = (subdomain || "centroid").toLowerCase().trim();
  const cached = orgCache.get(cleanSubdomain);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    return cached.data;
  }

  let org = null;
  try {
    if (["centroid", "verbolabs"].includes(cleanSubdomain)) {
      const { data } = await supabase
        .from("organizations")
        .select("*")
        .or("subdomain.eq.centroid,subdomain.eq.verbolabs")
        .limit(1);
      if (data && data.length > 0) org = data[0];
    } else {
      const { data } = await supabase
        .from("organizations")
        .select("*")
        .eq("subdomain", cleanSubdomain)
        .maybeSingle();
      if (data) org = data;
    }
  } catch (err) {
    console.error("DB Query error fetching organization space:", err?.message || err);
  }

  // Ultimate fallback for main 'centroid' / 'verbolabs' space if DB table or row doesn't exist yet
  if (!org && ["centroid", "verbolabs", "app", "www"].includes(cleanSubdomain)) {
    try {
      const { data: newVerboLabs } = await supabase
        .from("organizations")
        .insert({
          name: "VerboLabs",
          subdomain: "centroid",
          credits_allowed: 10000000,
          status: "active"
        })
        .select()
        .single();

      if (newVerboLabs) org = newVerboLabs;
    } catch (_) {}

    if (!org) {
      org = {
        id: null,
        name: "VerboLabs",
        subdomain: "centroid",
        credits_allowed: 10000000,
        credits_consumed: 0,
        status: "active"
      };
    }
  }

  if (org) {
    orgCache.set(cleanSubdomain, { data: org, timestamp: Date.now() });
  }

  return org;
}

function clearTenantCache() {
  orgCache.clear();
}

/**
 * Express middleware to identify the current tenant space strictly based on Host header, Origin, or X-Tenant-Subdomain header.
 * 
 * Examples:
 * - Host: test.centroid.verbolabs.com -> tenant_slug = test
 * - Host: test.lvh.me:5173 / test.localhost:5000 -> tenant_slug = test
 * - Host: centroid.verbolabs.com / localhost:5000 -> tenant_slug = centroid (default master tenant)
 */
async function resolveTenant(request, response, next) {
  try {
    let subdomain = "";

    // 1. Explicit API Header (for mobile or API clients)
    if (request.headers["x-tenant-subdomain"]) {
      subdomain = request.headers["x-tenant-subdomain"].toLowerCase().trim();
    }
    // 2. Host header resolution
    else if (request.headers.host) {
      const host = request.headers.host.split(":")[0]; // strip port
      const parts = host.split(".");
      
      // e.g. test.centroid.verbolabs.com -> 4 parts; test.lvh.me or test.localhost -> 2 or 3 parts
      if (parts.length >= 4) {
        subdomain = parts[0];
      } else if (parts.length === 3 && parts[1] === "lvh" && parts[2] === "me") {
        subdomain = parts[0];
      } else if (parts.length === 2 && parts[1] === "localhost") {
        subdomain = parts[0];
      }
    } 
    // 3. Origin / Referer header fallback
    else if (request.headers.origin || request.headers.referer) {
      try {
        const urlStr = request.headers.origin || request.headers.referer;
        const parsedUrl = new URL(urlStr);
        const parts = parsedUrl.hostname.split(".");
        if (parts.length >= 4) {
          subdomain = parts[0];
        } else if (parts.length === 3 && parts[1] === "lvh" && parts[2] === "me") {
          subdomain = parts[0];
        } else if (parts.length === 2 && parts[1] === "localhost") {
          subdomain = parts[0];
        }
      } catch (_) {}
    }

    if (!subdomain || ["www", "app", "centroid", "verbolabs", "localhost"].includes(subdomain.toLowerCase())) {
      subdomain = "centroid";
    }

    const tenant = await getOrganizationBySubdomain(subdomain);

    if (!tenant) {
      return response.status(404).json({ error: `Tenant space '${subdomain}' not found.` });
    }

    if (tenant.status === "suspended") {
      return response.status(403).json({ error: `Tenant space '${tenant.name}' is currently suspended. Please contact VerboLabs support.` });
    }

    request.tenant = tenant;
    request.tenant_id = tenant.id;
    next();
  } catch (err) {
    console.error("Tenant Resolution Error:", err);
    next();
  }
}

module.exports = {
  resolveTenant,
  getOrganizationBySubdomain,
  clearTenantCache
};
