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
        .or("subdomain.eq.centroid,subdomain.eq.verbolabs,subdomain.ilike.centroid,subdomain.ilike.verbolabs")
        .limit(1);
      if (data && data.length > 0) org = data[0];
    } else {
      // 1. Exact subdomain match
      const { data: exactOrg } = await supabase
        .from("organizations")
        .select("*")
        .eq("subdomain", cleanSubdomain)
        .maybeSingle();

      if (exactOrg) {
        org = exactOrg;
      } else {
        // 2. Case-insensitive subdomain or name match
        const { data: ilikeOrg } = await supabase
          .from("organizations")
          .select("*")
          .ilike("subdomain", cleanSubdomain)
          .maybeSingle();

        if (ilikeOrg) {
          org = ilikeOrg;
        } else {
          const { data: nameOrg } = await supabase
            .from("organizations")
            .select("*")
            .ilike("name", cleanSubdomain)
            .maybeSingle();

          if (nameOrg) org = nameOrg;
        }
      }
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
 * Express middleware to identify the current tenant space based on:
 * 1. Path-based client prefix: /c/:clientSlug in Referer / Origin or Request URL
 * 2. Headers: X-Tenant-Slug or X-Tenant-Subdomain
 * 3. Query params: ?space=, ?client=, ?tenant=, ?org=
 * 4. Host header: client.centroid.verbolabs.com
 */
async function resolveTenant(request, response, next) {
  try {
    let subdomain = "";

    // 1. Explicit API Headers (highest priority)
    if (request.headers["x-tenant-slug"]) {
      subdomain = request.headers["x-tenant-slug"].toLowerCase().trim();
    } else if (request.headers["x-tenant-subdomain"]) {
      subdomain = request.headers["x-tenant-subdomain"].toLowerCase().trim();
    }
    // 2. URL Query Parameter (e.g. ?space=piramal or ?client=piramal)
    else if (request.query.space || request.query.client || request.query.tenant || request.query.org) {
      subdomain = (request.query.space || request.query.client || request.query.tenant || request.query.org).toLowerCase().trim();
    }
    // 3. Referer / Origin pathname matching /c/:clientSlug
    else if (request.headers.referer || request.headers.origin) {
      try {
        const urlStr = request.headers.referer || request.headers.origin;
        const parsedUrl = new URL(urlStr);
        const pathMatch = parsedUrl.pathname.match(/^\/c\/([^\/]+)/);
        if (pathMatch && pathMatch[1]) {
          subdomain = pathMatch[1].toLowerCase().trim();
        } else if (parsedUrl.searchParams.get("space") || parsedUrl.searchParams.get("client") || parsedUrl.searchParams.get("tenant")) {
          subdomain = (parsedUrl.searchParams.get("space") || parsedUrl.searchParams.get("client") || parsedUrl.searchParams.get("tenant")).toLowerCase().trim();
        } else {
          const parts = parsedUrl.hostname.split(".");
          if (parts.length >= 4) {
            subdomain = parts[0];
          } else if (parts.length === 3 && parts[1] === "lvh" && parts[2] === "me") {
            subdomain = parts[0];
          } else if (parts.length === 2 && parts[1] === "localhost") {
            subdomain = parts[0];
          }
        }
      } catch (_) {}
    }
    // 4. Host header resolution (e.g. branch.centroid.verbolabs.com or branch.lvh.me)
    if (!subdomain && request.headers.host) {
      const host = request.headers.host.split(":")[0]; // strip port
      const parts = host.split(".");
      
      if (parts.length >= 4) {
        subdomain = parts[0];
      } else if (parts.length === 3 && parts[1] === "lvh" && parts[2] === "me") {
        subdomain = parts[0];
      } else if (parts.length === 2 && parts[1] === "localhost") {
        subdomain = parts[0];
      }
    } 

    if (!subdomain || ["www", "app", "centroid", "verbolabs", "localhost"].includes(subdomain.toLowerCase())) {
      subdomain = "centroid";
    }

    let tenant = await getOrganizationBySubdomain(subdomain);

    const isAuthRoute = /^\/api\/auth(\/|$)/.test(request.path || "");

    if (!tenant) {
      if (isAuthRoute) {
        tenant = await getOrganizationBySubdomain("centroid");
      }
      if (!tenant) {
        return response.status(404).json({ error: `Tenant space '${subdomain}' not found.` });
      }
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
