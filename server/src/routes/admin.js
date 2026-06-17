const express = require("express");
const { supabase } = require("../config/supabase");
const { checkAuth, checkRole } = require("../utils/authMiddleware");

const adminRouter = express.Router();

// Apply checkAuth and checkRole guards globally on admin endpoints (Admin & Manager only)
adminRouter.use(checkAuth);
adminRouter.use(checkRole(["admin", "manager"]));

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

    // Role-based validation checks
    if (currentUserRole !== "admin") {
      // Managers cannot change user roles
      if (role && role !== targetUser.role) {
        return response.status(403).json({ error: "Only Administrators can modify user roles" });
      }
      // Managers cannot change account status to suspend/unsuspend
      if (status && status !== targetUser.status) {
        return response.status(403).json({ error: "Only Administrators can suspend user accounts" });
      }
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

    // Delete user from Supabase Auth using service_role authority
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(id);
    
    if (authDeleteError) {
      console.error("Supabase Admin Auth Delete Error:", authDeleteError);
      throw authDeleteError;
    }

    response.json({ message: "User account deleted successfully" });
  } catch (error) {
    console.error("Admin Delete User Error:", error);
    response.status(500).json({ error: "Failed to delete user account" });
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
