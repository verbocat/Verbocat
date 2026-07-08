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
    const { data: users, error } = await supabase
      .from("profiles")
      .select("*")
      .order("email", { ascending: true });

    if (error) throw error;
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
    const { role, credits_allowed, has_translate_access, status } = request.body;
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

    // Only Administrators can access this route now, so no manager checks are needed

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

module.exports = {
  adminRouter
};
