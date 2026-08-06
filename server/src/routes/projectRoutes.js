const express = require("express");
const { supabase } = require("../config/supabase");
const { checkAuth } = require("../utils/authMiddleware");

const projectRouter = express.Router();

// 1. List Projects (Strictly scoped by organization tenant)
projectRouter.get("/projects", checkAuth, async (request, response) => {
  try {
    const activeTenantId = request.tenant?.id || request.profile?.organization_id;
    const isSuperAdmin = request.profile?.role === "super_admin";

    let query = supabase
      .from("projects")
      .select("*, documents(*)")
      .order("created_at", { ascending: false });

    if (!isSuperAdmin && activeTenantId) {
      query = query.eq("organization_id", activeTenantId);
    }

    const { data: projects, error } = await query;
    if (error) throw error;

    response.json({ projects: projects || [] });
  } catch (error) {
    console.error("List Projects Error:", error);
    response.status(500).json({ error: "Failed to fetch projects" });
  }
});

// 2. Create Project
projectRouter.post("/projects", checkAuth, async (request, response) => {
  try {
    const { name, source_lang, target_lang, due_date, notes } = request.body;
    const userId = request.user.id;
    const activeTenantId = request.tenant?.id || request.profile?.organization_id || null;

    if (!name) {
      return response.status(400).json({ error: "Project name is required" });
    }

    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        name: name.trim(),
        owner_id: userId,
        source_lang: source_lang || "en",
        target_lang: target_lang || "hi",
        due_date: due_date || null,
        notes: notes || "",
        organization_id: activeTenantId
      })
      .select()
      .single();

    if (error) throw error;

    response.json({ project });
  } catch (error) {
    console.error("Create Project Error:", error);
    response.status(500).json({ error: "Failed to create project" });
  }
});

// 3. Get Single Project Details
projectRouter.get("/projects/:id", checkAuth, async (request, response) => {
  try {
    const { id } = request.params;
    const activeTenantId = request.tenant?.id || request.profile?.organization_id;
    const isSuperAdmin = request.profile?.role === "super_admin";

    let query = supabase
      .from("projects")
      .select("*, documents(*)")
      .eq("id", id);

    if (!isSuperAdmin && activeTenantId) {
      query = query.eq("organization_id", activeTenantId);
    }

    const { data: project, error } = await query.single();
    if (error || !project) {
      return response.status(404).json({ error: "Project not found or access denied" });
    }

    response.json({ project });
  } catch (error) {
    console.error("Get Project Error:", error);
    response.status(500).json({ error: "Failed to fetch project details" });
  }
});

// 4. Update Project
projectRouter.put("/projects/:id", checkAuth, async (request, response) => {
  try {
    const { id } = request.params;
    const { name, status, due_date, notes } = request.body;
    const activeTenantId = request.tenant?.id || request.profile?.organization_id;
    const isSuperAdmin = request.profile?.role === "super_admin";

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (status !== undefined) updateData.status = status;
    if (due_date !== undefined) updateData.due_date = due_date;
    if (notes !== undefined) updateData.notes = notes;
    updateData.updated_at = new Date().toISOString();

    let query = supabase.from("projects").update(updateData).eq("id", id);
    if (!isSuperAdmin && activeTenantId) {
      query = query.eq("organization_id", activeTenantId);
    }

    const { data: updatedProject, error } = await query.select().single();
    if (error) throw error;

    response.json({ project: updatedProject });
  } catch (error) {
    console.error("Update Project Error:", error);
    response.status(500).json({ error: "Failed to update project" });
  }
});

// 5. Delete Project
projectRouter.delete("/projects/:id", checkAuth, async (request, response) => {
  try {
    const { id } = request.params;
    const activeTenantId = request.tenant?.id || request.profile?.organization_id;
    const isSuperAdmin = request.profile?.role === "super_admin";

    let query = supabase.from("projects").delete().eq("id", id);
    if (!isSuperAdmin && activeTenantId) {
      query = query.eq("organization_id", activeTenantId);
    }

    const { error } = await query;
    if (error) throw error;

    response.json({ message: "Project deleted successfully" });
  } catch (error) {
    console.error("Delete Project Error:", error);
    response.status(500).json({ error: "Failed to delete project" });
  }
});

module.exports = {
  projectRouter
};
