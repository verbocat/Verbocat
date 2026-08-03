const express = require("express");
const { supabase, supabaseAdmin } = require("../config/supabase");
const { checkAuth, checkRole } = require("../utils/authMiddleware");

const { clearTenantCache } = require("../utils/tenantMiddleware");

const adminRouter = express.Router();

// Apply checkAuth and checkRole guards globally on admin endpoints (Admin & Super Admin only)
adminRouter.use(checkAuth);
adminRouter.use(checkRole(["admin"]));

// ==========================================
// Super Admin Organization Space Management
// ==========================================

// 0a. List all client space organizations (Super Admin only)
adminRouter.get("/organizations", checkRole(["super_admin"]), async (request, response) => {
  try {
    const { data: orgs, error } = await supabase
      .from("organizations")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Retrieve user counts per organization
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, organization_id");

    const userCountMap = new Map();
    if (profiles) {
      profiles.forEach(p => {
        if (p.organization_id) {
          userCountMap.set(p.organization_id, (userCountMap.get(p.organization_id) || 0) + 1);
        }
      });
    }

    const organizations = orgs.map(org => ({
      ...org,
      userCount: userCountMap.get(org.id) || 0
    }));

    response.json({ organizations });
  } catch (error) {
    console.error("Super Admin List Organizations Error:", error);
    response.status(500).json({ error: "Failed to fetch client space organizations" });
  }
});

// 0b. Create new client space organization (Super Admin only)
adminRouter.post("/organizations", checkRole(["super_admin"]), async (request, response) => {
  try {
    const { name, subdomain, credits_allowed } = request.body;

    if (!name || !subdomain) {
      return response.status(400).json({ error: "Organization name and subdomain are required." });
    }

    const cleanSubdomain = subdomain.toLowerCase().trim().replace(/[^a-z0-9-]/g, "");

    const { data: existing } = await supabase
      .from("organizations")
      .select("id")
      .eq("subdomain", cleanSubdomain)
      .single();

    if (existing) {
      return response.status(400).json({ error: `Subdomain '${cleanSubdomain}' is already taken.` });
    }

    const { data: newOrg, error } = await supabase
      .from("organizations")
      .insert({
        name: name.trim(),
        subdomain: cleanSubdomain,
        credits_allowed: Number(credits_allowed) || 100000,
        status: "active"
      })
      .select()
      .single();

    if (error) throw error;

    clearTenantCache();
    response.json({ message: "Client space created successfully", organization: newOrg });
  } catch (error) {
    console.error("Create Organization Error:", error);
    response.status(500).json({ error: "Failed to create client space organization" });
  }
});

// 0c. Update organization space (Super Admin only)
adminRouter.put("/organizations/:id", checkRole(["super_admin"]), async (request, response) => {
  try {
    const { id } = request.params;
    const { name, credits_allowed, status } = request.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (credits_allowed !== undefined) updateData.credits_allowed = Number(credits_allowed);
    if (status !== undefined) updateData.status = status;

    const { data: updatedOrg, error } = await supabase
      .from("organizations")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    clearTenantCache();
    response.json({ message: "Client space updated successfully", organization: updatedOrg });
  } catch (error) {
    console.error("Update Organization Error:", error);
    response.status(500).json({ error: "Failed to update client space organization" });
  }
});

// 0d. Delete organization space (Super Admin only)
adminRouter.delete("/organizations/:id", checkRole(["super_admin"]), async (request, response) => {
  try {
    const { id } = request.params;

    const { error } = await supabase
      .from("organizations")
      .delete()
      .eq("id", id);

    if (error) throw error;

    clearTenantCache();
    response.json({ message: "Client space deleted successfully" });
  } catch (error) {
    console.error("Delete Organization Error:", error);
    response.status(500).json({ error: "Failed to delete client space organization" });
  }
});

// 1. List Registered Users (Scoped to active tenant space via profiles & memberships)
adminRouter.get("/users", async (request, response) => {
  try {
    const isSuperAdmin = request.profile.role === "super_admin";
    const activeTenantId = request.tenant?.id;
    const isMainSpace = ["centroid", "verbolabs"].includes(request.tenant?.subdomain?.toLowerCase() || "centroid");

    // Fetch profiles matching space
    let profilesQuery = supabase.from("profiles").select("*, organization:organizations(*)").order("email", { ascending: true });

    if (!isMainSpace && activeTenantId) {
      profilesQuery = profilesQuery.eq("organization_id", activeTenantId);
    } else if (request.query.organization_id) {
      profilesQuery = profilesQuery.eq("organization_id", request.query.organization_id);
    } else if (!isSuperAdmin) {
      const userOrgId = request.profile.organization_id || activeTenantId;
      if (userOrgId) profilesQuery = profilesQuery.eq("organization_id", userOrgId);
    }

    const { data: baseProfiles } = await profilesQuery;

    // Fetch memberships matching active space
    let membershipsMap = new Map();
    if (activeTenantId) {
      const { data: mems } = await supabase
        .from("user_tenant_memberships")
        .select("*, profile:profiles(*)")
        .eq("organization_id", activeTenantId);

      if (mems) {
        mems.forEach(m => membershipsMap.set(m.user_id, m));
      }
    }

    // Merge base profiles and memberships
    const userMap = new Map();
    (baseProfiles || []).forEach(p => {
      userMap.set(p.id, p);
    });

    membershipsMap.forEach((m, userId) => {
      const existing = userMap.get(userId) || m.profile || { id: userId, email: m.user_id };
      userMap.set(userId, {
        ...existing,
        role: m.role || existing.role,
        organization_id: m.organization_id || existing.organization_id,
        credits_allowed: m.credits_allowed ?? existing.credits_allowed,
        credits_consumed: m.credits_consumed ?? existing.credits_consumed,
        has_translate_access: m.has_translate_access ?? existing.has_translate_access,
        status: m.status || existing.status
      });
    });

    let authUsersMap = new Map();
    try {
      const { data: authData } = await supabaseAdmin.auth.admin.listUsers();
      if (authData?.users) {
        authUsersMap = new Map(authData.users.map(u => [u.id, u]));
      }
    } catch (_) {}

    const users = Array.from(userMap.values()).map(p => {
      const authUser = authUsersMap.get(p.id);
      return {
        ...p,
        email: p.email || authUser?.email || "User",
        email_confirmed: authUser ? !!(authUser.email_confirmed_at || authUser.confirmed_at) : true
      };
    });

    response.json({ users });
  } catch (error) {
    console.error("Admin List Users Exception:", error);
    response.status(500).json({ error: error.message || "Failed to fetch user accounts" });
  }
});

// 2. Modify User Permissions & Credit Limits
adminRouter.put("/users/:id", async (request, response) => {
  try {
    const { id } = request.params;
    const { role, credits_allowed, has_translate_access, status, email_confirmed } = request.body;
    const currentUserRole = request.profile.role;
    const activeTenantId = request.tenant?.id || request.profile.organization_id;

    // Prepare update data
    const updateData = {};
    if (role !== undefined && (currentUserRole === "super_admin" || role !== "super_admin")) updateData.role = role;
    if (credits_allowed !== undefined) updateData.credits_allowed = Number(credits_allowed);
    if (has_translate_access !== undefined) updateData.has_translate_access = !!has_translate_access;
    if (status !== undefined) updateData.status = status;

    // Update in profiles table
    await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", id);

    // Also upsert into user_tenant_memberships for active space
    if (activeTenantId) {
      await supabase
        .from("user_tenant_memberships")
        .upsert({
          user_id: id,
          organization_id: activeTenantId,
          ...updateData
        }, { onConflict: "user_id,organization_id" });
    }

    // Manually verify user in Supabase Auth if requested
    if (email_confirmed === true) {
      await supabaseAdmin.auth.admin.updateUserById(id, { email_confirm: true }).catch(() => {});
    }

    response.json({ message: "User account updated successfully" });
  } catch (error) {
    console.error("Admin Update User Error:", error);
    response.status(500).json({ error: "Failed to update user account settings" });
  }
});

// 3. Delete User Account (Admin Only)
adminRouter.delete("/users/:id", checkRole(["admin"]), async (request, response) => {
  try {
    const { id } = request.params;

    // Prevent admins from deleting themselves
    if (request.profile && request.profile.id === id) {
      return response.status(400).json({ error: "You cannot delete your own admin account." });
    }

    // Delete user from Supabase Auth using service_role authority
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(id);
    
    // If the error is 404 (user not found in Auth), we still proceed to clean up any database profile
    const isUserNotFound = authDeleteError && (
      authDeleteError.status === 404 || 
      authDeleteError.message?.toLowerCase().includes("not found")
    );

    if (authDeleteError && !isUserNotFound) {
      console.error("Supabase Admin Auth Delete Error:", authDeleteError);
      return response.status(400).json({
        error: authDeleteError.message || "Failed to delete auth user",
        details: authDeleteError
      });
    }

    // Explicitly delete from profiles to ensure complete cleanup
    // (in case DB cascade triggers didn't fire or there are orphaned profiles)
    const { error: profileDeleteError } = await supabase
      .from("profiles")
      .delete()
      .eq("id", id);

    if (profileDeleteError) {
      console.error("Profile Delete Error:", profileDeleteError);
      return response.status(400).json({
        error: profileDeleteError.message || "Failed to delete user profile from database"
      });
    }

    response.json({ message: "User account deleted successfully" });
  } catch (error) {
    console.error("Admin Delete User Error:", error);
    response.status(500).json({ 
      error: "Failed to delete user account",
      details: error.message || error
    });
  }
});

// 4. Retrieve Credits Transaction Logs
adminRouter.get("/credit-logs", async (request, response) => {
  try {
    const activeTenantId = request.tenant?.id;
    const isSuperAdmin = request.profile.role === "super_admin";
    const isMainSpace = ["centroid", "verbolabs"].includes(request.tenant?.subdomain?.toLowerCase() || "centroid");

    let query = supabase.from("credit_logs").select("*").order("created_at", { ascending: false });

    if (!isMainSpace && activeTenantId) {
      query = query.eq("organization_id", activeTenantId);
    } else if (request.query.organization_id) {
      query = query.eq("organization_id", request.query.organization_id);
    } else if (!isSuperAdmin) {
      const userOrgId = request.profile.organization_id || activeTenantId;
      if (userOrgId) query = query.eq("organization_id", userOrgId);
    }

    const { data: logs, error } = await query;

    if (error) {
      console.error("Credit logs fetch error:", error);
      return response.json({ logs: [] });
    }
    response.json({ logs: logs || [] });
  } catch (error) {
    console.error("Admin Credit Logs Exception:", error);
    response.json({ logs: [] });
  }
});

// 5. List/Search Translation Memory (TM)
adminRouter.get("/tm", async (request, response) => {
  try {
    const { search, sourceLang, targetLang } = request.query;
    const activeTenantId = request.tenant?.id;
    const isSuperAdmin = request.profile?.role === "super_admin";
    const isMainSpace = ["centroid", "verbolabs"].includes(request.tenant?.subdomain?.toLowerCase() || "centroid");

    let query = supabase.from("translation_memory").select("*").order("created_at", { ascending: false });

    // Isolation logic: filter TM entries strictly by active tenant space
    if (!isMainSpace && activeTenantId) {
      query = query.eq("organization_id", activeTenantId);
    } else if (request.query.organization_id) {
      query = query.eq("organization_id", request.query.organization_id);
    } else if (!isSuperAdmin) {
      const userOrgId = request.profile?.organization_id || activeTenantId;
      if (userOrgId) query = query.eq("organization_id", userOrgId);
    }

    if (sourceLang) {
      query = query.eq("source_lang", sourceLang);
    }
    if (targetLang) {
      query = query.eq("target_lang", targetLang);
    }

    const { data, error } = await query;
    if (error) throw error;

    let filtered = data || [];
    if (search) {
      const term = search.toLowerCase();
      filtered = filtered.filter(item => 
        (item.source_text && item.source_text.toLowerCase().includes(term)) ||
        (item.target_text && item.target_text.toLowerCase().includes(term)) ||
        (item.provider && item.provider.toLowerCase().includes(term))
      );
    }

    response.json({ tm: filtered });
  } catch (error) {
    console.error("Admin List TM Error:", error);
    response.status(500).json({ error: "Failed to fetch translation memory entries" });
  }
});

// 6. Update Translation Memory entry
adminRouter.put("/tm/:id", async (request, response) => {
  try {
    const { id } = request.params;
    const { target_text } = request.body;

    if (target_text === undefined || target_text === null) {
      return response.status(400).json({ error: "Target text is required" });
    }

    const { data, error } = await supabase
      .from("translation_memory")
      .update({ target_text })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    response.json({ message: "Translation memory entry updated successfully", entry: data });
  } catch (error) {
    console.error("Admin Update TM Error:", error);
    response.status(500).json({ error: "Failed to update translation memory entry" });
  }
});

// 7. Delete Translation Memory entry
adminRouter.delete("/tm/:id", async (request, response) => {
  try {
    const { id } = request.params;

    const { error } = await supabase
      .from("translation_memory")
      .delete()
      .eq("id", id);

    if (error) throw error;

    response.json({ message: "Translation memory entry deleted successfully" });
  } catch (error) {
    console.error("Admin Delete TM Error:", error);
    response.status(500).json({ error: "Failed to delete translation memory entry" });
  }
});

module.exports = {
  adminRouter
};
