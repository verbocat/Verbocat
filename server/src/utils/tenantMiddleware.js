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
    const { data } = await supabase
      .from("organizations")
      .select("*")
      .or(`subdomain.eq.${cleanSubdomain},subdomain.eq.verbolabs,subdomain.eq.centroid`)
      .maybeSingle();

    if (data) {
      org = data;
    }
  } catch (err) {
    console.error("DB Query error fetching organization space:", err?.message || err);
  }

  // Fallback to default 'centroid' / 'verbolabs' organization
  if (!org && !["centroid", "verbolabs"].includes(cleanSubdomain)) {
    try {
      const { data: defaultOrg } = await supabase
        .from("organizations")
        .select("*")
        .or("subdomain.eq.centroid,subdomain.eq.verbolabs")
        .maybeSingle();

      if (defaultOrg) org = defaultOrg;
    } catch (_) {}
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
 * Express middleware to identify the current tenant space based on host, headers, or query params.
 */
async function resolveTenant(request, response, next) {
  try {
    let subdomain = "";

    // 1. Explicit Header or Query Parameter (?space=slug or ?tenant=slug)
    if (request.headers["x-tenant-subdomain"]) {
      subdomain = request.headers["x-tenant-subdomain"];
    } else if (request.query.space || request.query.tenant || request.query.org) {
      subdomain = request.query.space || request.query.tenant || request.query.org;
    }
    // 2. Host header (e.g. test.centroid.verbolabs.com or test.localhost:5000)
    else if (request.headers.host) {
      const host = request.headers.host.split(":")[0]; // strip port
      const parts = host.split(".");
      // test.centroid.verbolabs.com -> 4 parts; test.localhost -> 2 parts
      if (parts.length > 3 || (parts.length === 2 && parts[1] === "localhost")) {
        subdomain = parts[0];
      }
    } 
    // 3. Origin / Referer header fallback
    else if (request.headers.origin || request.headers.referer) {
      try {
        const urlStr = request.headers.origin || request.headers.referer;
        const parsedUrl = new URL(urlStr);
        const parts = parsedUrl.hostname.split(".");
        if (parts.length > 3 || (parts.length === 2 && parts[1] === "localhost")) {
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
