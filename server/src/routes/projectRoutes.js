const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { supabase } = require("../config/supabase");
const { checkAuth } = require("../utils/authMiddleware");
const { processUploadedFile } = require("../services/fileService");

const projectRouter = express.Router();

const uploadDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({ dest: uploadDir });

// 1. List Projects (Strictly scoped by organization tenant)
projectRouter.get(["/projects", "/api/projects"], checkAuth, async (request, response) => {
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
projectRouter.post(["/projects", "/api/projects"], checkAuth, async (request, response) => {
  try {
    const { name, source_lang, target_lang, sourceLanguage, targetLanguages, due_date, notes } = request.body;
    const userId = request.user.id;
    const activeTenantId = request.tenant?.id || request.profile?.organization_id || null;

    if (!name) {
      return response.status(400).json({ error: "Project name is required" });
    }

    const sLang = source_lang || sourceLanguage || "en";
    const tLang = target_lang || targetLanguages || ["hi"];

    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        name: name.trim(),
        owner_id: userId,
        source_lang: sLang,
        target_lang: tLang,
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
projectRouter.get(["/projects/:id", "/api/projects/:id"], checkAuth, async (request, response) => {
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

// 4. Upload File to Project
projectRouter.post(
  ["/projects/:projectId/upload", "/api/projects/:projectId/upload"],
  checkAuth,
  upload.single("file"),
  async (request, response) => {
    try {
      const { projectId } = request.params;
      if (!request.file) {
        return response.status(400).json({ error: "No file was uploaded." });
      }

      const activeTenantId = request.tenant?.id || request.profile?.organization_id || null;
      const userId = request.user.id;

      // 1. Verify project exists
      const { data: project, error: projErr } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .single();

      if (projErr || !project) {
        return response.status(404).json({ error: "Project not found or access denied." });
      }

      // 2. Parse uploaded file using processUploadedFile
      const result = await processUploadedFile(request.file);
      const documentId = result.fileId;

      // 3. Create document record bound to project_id and organization_id
      const { data: docRecord, error: docError } = await supabase
        .from("documents")
        .insert({
          id: documentId,
          name: result.originalName || request.file.originalname || "Untitled Document",
          owner_id: userId,
          file_id: documentId,
          project_id: projectId,
          source_lang: project.source_lang || "en",
          target_lang: project.target_lang || "hi",
          organization_id: activeTenantId
        })
        .select()
        .single();

      if (docError) {
        console.error("Project Document Create Error:", docError);
        return response.status(500).json({ error: `Failed to create document: ${docError.message}` });
      }

      // 4. Persist parsed segments to DB in batches
      const segmentInserts = result.segments.map((seg, idx) => ({
        document_id: documentId,
        segment_index: idx,
        source_text: seg.source || "",
        target_text: seg.target || "",
        status: "draft"
      }));

      const BATCH_SIZE = 500;
      for (let i = 0; i < segmentInserts.length; i += BATCH_SIZE) {
        const batch = segmentInserts.slice(i, i + BATCH_SIZE);
        const { error: segError } = await supabase
          .from("document_segments")
          .insert(batch);

        if (segError) {
          console.error("Project Segments Persist Error:", segError);
          await supabase.from("documents").delete().eq("id", documentId);
          return response.status(500).json({ error: `Failed to persist segments: ${segError.message}` });
        }
      }

      // 5. Create job records for target languages
      const targetLangs = Array.isArray(project.target_lang) ? project.target_lang : [project.target_lang || "hi"];
      const jobsToInsert = targetLangs.map(lang => ({
        project_id: projectId,
        document_id: documentId,
        target_lang: lang,
        status: "in_progress",
        organization_id: activeTenantId
      }));

      let createdJobs = [];
      const { data: insertedJobs, error: jobErr } = await supabase
        .from("jobs")
        .insert(jobsToInsert)
        .select("*, documents(*)");

      if (!jobErr && insertedJobs) {
        createdJobs = insertedJobs;
      }

      response.json({
        document: docRecord,
        jobs: createdJobs,
        segments: result.segments,
        type: result.type,
        documentId
      });
    } catch (error) {
      console.error("Project Upload Error:", error);
      response.status(500).json({ error: error.message || "Failed to upload file to project" });
    }
  }
);

// 5. Fetch Project Activities
projectRouter.get(["/projects/:projectId/activities", "/api/projects/:projectId/activities"], checkAuth, async (request, response) => {
  try {
    const { projectId } = request.params;
    const { data: activities } = await supabase
      .from("activity_logs")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    response.json({ activities: activities || [] });
  } catch (error) {
    response.json({ activities: [] });
  }
});

// 6. Fetch Project Analytics
projectRouter.get(["/projects/:projectId/analytics", "/api/projects/:projectId/analytics"], checkAuth, async (request, response) => {
  try {
    const { projectId } = request.params;
    const { data: docs } = await supabase
      .from("documents")
      .select("id, name")
      .eq("project_id", projectId);

    const docIds = (docs || []).map(d => d.id);
    let totalSegments = 0;
    let translatedSegments = 0;

    if (docIds.length > 0) {
      const { data: segs } = await supabase
        .from("document_segments")
        .select("status")
        .in("document_id", docIds);

      if (segs) {
        totalSegments = segs.length;
        translatedSegments = segs.filter(s => s.status === "translated" || s.status === "approved").length;
      }
    }

    response.json({
      totalDocuments: docIds.length,
      totalSegments,
      translatedSegments,
      completionRate: totalSegments > 0 ? Math.round((translatedSegments / totalSegments) * 100) : 0
    });
  } catch (error) {
    response.json({ totalDocuments: 0, totalSegments: 0, translatedSegments: 0, completionRate: 0 });
  }
});

// 7. Update Project
projectRouter.put(["/projects/:id", "/api/projects/:id"], checkAuth, async (request, response) => {
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

// 8. Delete Project
projectRouter.delete(["/projects/:id", "/api/projects/:id"], checkAuth, async (request, response) => {
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
