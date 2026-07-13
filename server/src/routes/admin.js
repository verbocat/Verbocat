const express = require("express");
const { supabase, supabaseAdmin } = require("../config/supabase");
const { checkAuth, checkRole } = require("../utils/authMiddleware");

const adminRouter = express.Router();

// Apply checkAuth and checkRole guards globally on admin endpoints (Admin & Manager only)
adminRouter.use(checkAuth);
adminRouter.use(checkRole(["admin"]));

// 1. List All Registered Users
adminRouter.get("/users", async (request, response) => {
  try {
    const [profilesResult, authUsersResult] = await Promise.all([
      supabase.from("profiles").select("*").order("email", { ascending: true }),
      supabaseAdmin.auth.admin.listUsers()
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (authUsersResult.error) throw authUsersResult.error;

    const authUsersMap = new Map(authUsersResult.data.users.map(u => [u.id, u]));

    const users = profilesResult.data.map(p => {
      const authUser = authUsersMap.get(p.id);
      return {
        ...p,
        email_confirmed: authUser ? !!(authUser.email_confirmed_at || authUser.confirmed_at) : false
      };
    });

    response.json({ users });
  } catch (error) {
    console.error("Admin List Users Error:", error);
    response.status(500).json({ error: "Failed to fetch user accounts" });
  }
});

// 2. Modify User Permissions & Credit Limits
adminRouter.put("/users/:id", async (request, response) => {
  try {
    const { id } = request.params;
    const { role, credits_allowed, has_translate_access, status, email_confirmed } = request.body;
    const currentUserRole = request.profile.role;

    // Fetch original user profile details
    const { data: targetUser, error: fetchError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !targetUser) {
      return response.status(404).json({ error: "User account not found" });
    }

    // Prepare update parameters
    const updateData = {};
    if (role !== undefined) updateData.role = role;
    if (credits_allowed !== undefined) updateData.credits_allowed = Number(credits_allowed);
    if (has_translate_access !== undefined) updateData.has_translate_access = !!has_translate_access;
    if (status !== undefined) updateData.status = status;

    const { error: updateError } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", id);

    if (updateError) throw updateError;

    // Manually verify user in Supabase Auth if requested
    if (email_confirmed === true) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(id, {
        email_confirm: true
      });
      if (authError) {
        console.error("Failed to manually verify user auth:", authError);
      }
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
    const { data: logs, error } = await supabase
      .from("credit_logs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    response.json({ logs });
  } catch (error) {
    console.error("Admin Credit Logs Error:", error);
    response.status(500).json({ error: "Failed to fetch credit transaction logs" });
  }
});

// 5. List/Search Translation Memory (TM)
adminRouter.get("/tm", async (request, response) => {
  try {
    const { search, sourceLang, targetLang } = request.query;
    let query = supabase.from("translation_memory").select("*").order("created_at", { ascending: false });

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
