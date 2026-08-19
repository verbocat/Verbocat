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
    if (request.profile?.role === "linguist") {
      return response.status(403).json({ error: "Access denied. Linguist accounts do not have access to project management lists." });
    }

    const userId = request.user.id;
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

    // PRIVATE PROJECT SCOPING:
    // Non-superadmin users ONLY see projects they created (owner_id === userId)
    // OR projects where documents have been explicitly shared with them via document_access!
    if (!isSuperAdmin) {
      const { data: accessRows } = await supabase
        .from("document_access")
        .select("document_id, documents(project_id)")
        .eq("user_id", userId);

      const sharedProjectIds = new Set();
      (accessRows || []).forEach(row => {
        if (row.documents?.project_id) {
          sharedProjectIds.add(row.documents.project_id);
        }
      });

      const filteredProjects = (projects || []).filter(p => p.owner_id === userId || sharedProjectIds.has(p.id));
      return response.json({ projects: filteredProjects });
    }

    response.json({ projects: projects || [] });
  } catch (error) {
    console.error("List Projects Error:", error);
    response.status(500).json({ error: "Failed to fetch projects" });
  }
});

// 2. Create Project
projectRouter.post(["/projects", "/api/projects"], checkAuth, async (request, response) => {
  try {
    const {
      name,
      client,
      description,
      source_lang,
      target_lang,
      target_languages,
      sourceLanguage,
      targetLanguages,
      due_date,
      deadline,
      dueDate,
      notes,
      settings
    } = request.body;
    const userId = request.user.id;
    const activeTenantId = request.tenant?.id || request.profile?.organization_id || null;

    if (!name) {
      return response.status(400).json({ error: "Project name is required" });
    }

    const sLang = source_lang || sourceLanguage || "en";
    const tLangRaw = target_languages || targetLanguages || target_lang || ["hi"];
    const tLangsArray = Array.isArray(tLangRaw) ? tLangRaw : [tLangRaw];

    if (tLangsArray.includes(sLang)) {
      return response.status(400).json({ error: "Source and target language cannot be the same." });
    }

    const dDate = due_date || deadline || dueDate || null;
    const projDescription = description || notes || "";
    const mergedSettings = { ...(settings || {}), due_date: dDate };

    const insertPayload = {
      name: name.trim(),
      owner_id: userId,
      source_lang: sLang,
      target_languages: tLangsArray,
      description: projDescription,
      settings: mergedSettings,
      organization_id: activeTenantId
    };

    if (client) {
      insertPayload.client = client;
    }

    const { data: project, error } = await supabase
      .from("projects")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error("Supabase Project Insert Error:", error);
      throw error;
    }

    response.json({ project });
  } catch (error) {
    console.error("Create Project Error:", error);
    response.status(500).json({ error: error.message || "Failed to create project" });
  }
});

// 2.5 Fetch Global Audit History (MUST BE DECLARED BEFORE /projects/:id TO PREVENT ROUTE TRAPPING)
projectRouter.get(["/projects/history", "/api/projects/history"], checkAuth, async (request, response) => {
  try {
    const history = [];
    const activeTenantId = request.tenant?.id || request.profile?.organization_id;
    const isSuperAdmin = request.profile?.role === "super_admin";

    // 1. Fetch recent projects
    let projsQuery = supabase
      .from("projects")
      .select("*, profiles(email)")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!isSuperAdmin && activeTenantId) {
      projsQuery = projsQuery.eq("organization_id", activeTenantId);
    }

    const { data: projs } = await projsQuery;

    if (projs && projs.length > 0) {
      projs.forEach(proj => {
        history.push({
          id: `proj_${proj.id}`,
          event_type: "PROJECT_CREATED",
          user_name: proj.profiles?.email || "Project Owner",
          projectName: proj.name,
          created_at: proj.created_at,
          details: {
            projectName: proj.name,
            sourceLang: proj.source_lang,
            targetLanguages: proj.target_languages
          }
        });
      });
    }

    // 2. Fetch recent documents
    let docsQuery = supabase
      .from("documents")
      .select("*, projects(name), profiles(email)")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!isSuperAdmin && activeTenantId) {
      docsQuery = docsQuery.eq("organization_id", activeTenantId);
    }

    const { data: docs } = await docsQuery;

    if (docs && docs.length > 0) {
      docs.forEach(doc => {
        history.push({
          id: `doc_${doc.id}`,
          event_type: "FILE_UPLOADED",
          user_name: doc.profiles?.email || "Coordinator",
          projectName: doc.projects?.name || "Project",
          created_at: doc.created_at,
          details: {
            fileName: doc.name,
            fileSize: doc.file_size,
            wordCount: doc.word_count || 0,
            targetLang: doc.target_lang
          }
        });
      });
    }

    // 3. Fetch recent shares
    const { data: shares } = await supabase
      .from("document_access")
      .select("*, profiles(email), documents(name, projects(name))")
      .order("created_at", { ascending: false })
      .limit(50);

    if (shares && shares.length > 0) {
      shares.forEach(s => {
        history.push({
          id: `share_${s.id}`,
          event_type: "PROJECT_SHARED",
          user_name: "Project Coordinator",
          projectName: s.documents?.projects?.name || "Project",
          created_at: s.created_at,
          details: {
            sharedWith: s.profiles?.email || "collaborator",
            fileName: s.documents?.name,
            accessLevel: s.permission || "editor"
          }
        });
      });
    }

    // Sort all history entries by created_at descending
    history.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    response.json({ history });
  } catch (error) {
    console.error("Fetch Global History Error:", error);
    response.json({ history: [] });
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

    const userId = request.user.id;
    if (!isSuperAdmin && project.owner_id !== userId) {
      const { data: accessRow } = await supabase
        .from("document_access")
        .select("id, documents!inner(project_id)")
        .eq("user_id", userId)
        .eq("documents.project_id", id)
        .limit(1);

      if (!accessRow || accessRow.length === 0) {
        return response.status(403).json({ error: "Access denied. This project is private to its owner and has not been shared with you." });
      }
    }

    // Fetch documents belonging to this project
    const { data: docs } = await supabase
      .from("documents")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: false });

    // Fetch jobs belonging to this project
    const { data: jobs } = await supabase
      .from("jobs")
      .select("*, documents(*)")
      .eq("project_id", id)
      .order("created_at", { ascending: false });

    const filesList = docs && docs.length > 0 ? docs : (project.documents || []);

    response.json({
      project,
      files: filesList,
      jobs: jobs || []
    });
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
    const startTime = Date.now();
    try {
      const { projectId } = request.params;
      if (!request.file) {
        console.error("[PROJECT_UPLOAD_ERROR] No file object in request");
        return response.status(400).json({ error: "No file was uploaded." });
      }

      console.log(`\n========================================`);
      console.log(`[PROJECT_UPLOAD_START] Received file: "${request.file.originalname}" (${(request.file.size / 1024).toFixed(1)} KB) for ProjectId: ${projectId}`);

      const activeTenantId = request.tenant?.id || request.profile?.organization_id || null;
      const userId = request.user.id;

      // 1. Verify project exists
      console.log(`[PROJECT_UPLOAD_STEP 1/5] Verifying project ${projectId}...`);
      const { data: project, error: projErr } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .single();

      if (projErr || !project) {
        console.error(`[PROJECT_UPLOAD_ERROR] Project ${projectId} not found or access denied:`, projErr);
        return response.status(404).json({ error: "Project not found or access denied." });
      }
      console.log(`[PROJECT_UPLOAD_STEP 1/5 SUCCESS] Project verified! Name: "${project.name}" | Target Langs: ${JSON.stringify(project.target_lang)}`);

      // 2. Parse uploaded file using processUploadedFile
      const parseStartTime = Date.now();
      console.log(`[PROJECT_UPLOAD_STEP 2/5] Parsing file content and extracting segments...`);
      const result = await processUploadedFile(request.file);
      const parseTimeMs = Date.now() - parseStartTime;
      const documentId = result.fileId;
      console.log(`[PROJECT_UPLOAD_STEP 2/5 SUCCESS] File parsed in ${parseTimeMs}ms! DocId: ${documentId} | Total Segments: ${result.segments.length}`);

      // 3. Create document record bound to project_id and organization_id
      const dbStartTime = Date.now();
      console.log(`[PROJECT_UPLOAD_STEP 3/5] Creating document record in "documents" table...`);
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
        console.error("[PROJECT_UPLOAD_STEP 3/5 ERROR] Document insert error:", docError);
        return response.status(500).json({ error: `Failed to create document: ${docError.message}` });
      }
      console.log(`[PROJECT_UPLOAD_STEP 3/5 SUCCESS] Document record created!`);

      // 4. Persist parsed template segments to DB in sequential batches with live progress
      console.log(`[PROJECT_UPLOAD_STEP 4/5] Persisting ${result.segments.length} template segments to "document_segments" (target_lang: null)...`);
      const segmentInserts = result.segments.map((seg, idx) => ({
        document_id: documentId,
        segment_index: idx + 1,
        target_lang: null,
        source_text: seg.source || "",
        target_text: "",
        status: "draft"
      }));

      const BATCH_SIZE = 500;
      const batches = [];
      for (let i = 0; i < segmentInserts.length; i += BATCH_SIZE) {
        batches.push(segmentInserts.slice(i, i + BATCH_SIZE));
      }

      console.log(`[PROJECT_UPLOAD_STEP 4/5] Inserting ${batches.length} batch(es) of max ${BATCH_SIZE} rows...`);
      let batchSuccessCount = 0;

      for (let bIdx = 0; bIdx < batches.length; bIdx++) {
        const batch = batches[bIdx];
        const { error: batchErr } = await supabase.from("document_segments").insert(batch);
        if (batchErr) {
          console.error(`[PROJECT_UPLOAD_STEP 4/5 ERROR] Batch ${bIdx + 1}/${batches.length} failed:`, batchErr);
          await supabase.from("documents").delete().eq("id", documentId);
          return response.status(500).json({ error: `Failed to persist segments batch ${bIdx + 1}: ${batchErr.message}` });
        }
        batchSuccessCount += batch.length;
        console.log(`[PROJECT_UPLOAD_STEP 4/5 PROGRESS] Batch ${bIdx + 1}/${batches.length} inserted (${batchSuccessCount}/${result.segments.length} rows saved)...`);
      }

      const dbSaveTimeMs = Date.now() - dbStartTime;
      console.log(`[PROJECT_UPLOAD_STEP 4/5 SUCCESS] All ${result.segments.length} template segments persisted to DB in ${dbSaveTimeMs}ms!`);

      // 5. Create job records for target languages
      const targetLangs = Array.isArray(project.target_lang) ? project.target_lang : [project.target_lang || "hi"];
      console.log(`[PROJECT_UPLOAD_STEP 5/5] Creating job records for target languages: ${targetLangs.join(', ')}...`);
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
      console.log(`[PROJECT_UPLOAD_STEP 5/5 SUCCESS] Created ${createdJobs.length} translation jobs!`);

      const totalTimeMs = Date.now() - startTime;
      console.log(`[PROJECT_UPLOAD_COMPLETE] Upload & processing finished successfully in ${totalTimeMs}ms (${(totalTimeMs / 1000).toFixed(2)}s)!`);
      console.log(`========================================\n`);

      response.json({
        document: docRecord,
        jobs: createdJobs,
        segmentsCount: result.segments.length,
        type: result.type,
        metrics: {
          parseTimeMs,
          dbSaveTimeMs,
          batchCount: batches.length,
          totalTimeMs
        }
      });
    } catch (error) {
      console.error("[PROJECT_UPLOAD_EXCEPTION] Unhandled upload error:", error);
      if (request.file && request.file.path && fs.existsSync(request.file.path)) {
        fs.unlinkSync(request.file.path);
      }
      response.status(500).json({ error: error.message || "Failed to process project file upload" });
    }
  }
);

// 5. Fetch Project Activities (Audit History)
projectRouter.get(["/projects/:projectId/activities", "/api/projects/:projectId/activities"], checkAuth, async (request, response) => {
  try {
    const { projectId } = request.params;
    const history = [];

    // 1. Fetch Project Details
    const { data: proj } = await supabase
      .from("projects")
      .select("*, profiles(email)")
      .eq("id", projectId)
      .maybeSingle();

    if (proj) {
      history.push({
        id: `proj_created_${proj.id}`,
        event_type: "PROJECT_CREATED",
        user_name: proj.profiles?.email || "Project Owner",
        projectName: proj.name,
        created_at: proj.created_at,
        details: {
          projectName: proj.name,
          sourceLang: proj.source_lang,
          targetLanguages: proj.target_languages
        }
      });
    }

    // 2. Fetch Documents uploaded to this project
    const { data: docs } = await supabase
      .from("documents")
      .select("*, profiles(email)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    const docIds = [];
    if (docs && docs.length > 0) {
      docs.forEach(doc => {
        docIds.push(doc.id);
        history.push({
          id: `file_uploaded_${doc.id}`,
          event_type: "FILE_UPLOADED",
          user_name: doc.profiles?.email || proj?.profiles?.email || "Coordinator",
          projectName: proj?.name || "Project",
          created_at: doc.created_at,
          details: {
            fileName: doc.name,
            fileSize: doc.file_size,
            wordCount: doc.word_count || 0,
            targetLang: doc.target_lang
          }
        });
      });
    }

    // 3. Fetch Access shares for documents in this project
    if (docIds.length > 0) {
      const { data: shares } = await supabase
        .from("document_access")
        .select("*, profiles(email), documents(name)")
        .in("document_id", docIds)
        .order("created_at", { ascending: false });

      if (shares && shares.length > 0) {
        shares.forEach(s => {
          history.push({
            id: `share_${s.id}`,
            event_type: "PROJECT_SHARED",
            user_name: "Project Coordinator",
            projectName: proj?.name || "Project",
            created_at: s.created_at,
            details: {
              sharedWith: s.profiles?.email || "collaborator",
              fileName: s.documents?.name,
              accessLevel: s.permission || "editor"
            }
          });
        });
      }
    }

    // 4. Safely query activity_logs if table exists
    try {
      const { data: actLogs } = await supabase
        .from("activity_logs")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (actLogs && actLogs.length > 0) {
        actLogs.forEach(log => {
          history.push(log);
        });
      }
    } catch (_) {
      // Ignore missing activity_logs table
    }

    // Sort all history entries by created_at descending
    history.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    response.json({ activities: history });
  } catch (error) {
    console.error("Fetch Project Activities Error:", error);
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
    const { name, status, due_date, notes, description } = request.body;
    const activeTenantId = request.tenant?.id || request.profile?.organization_id;
    const isSuperAdmin = request.profile?.role === "super_admin";

    const { data: currProject } = await supabase.from("projects").select("settings").eq("id", id).single();
    const currSettings = currProject?.settings || {};

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined || notes !== undefined) {
      updateData.description = description || notes || "";
    }

    const newSettings = { ...currSettings };
    if (status !== undefined) newSettings.status = status;
    if (due_date !== undefined) newSettings.due_date = due_date;
    updateData.settings = newSettings;
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
    response.status(500).json({ error: error.message || "Failed to update project" });
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

// 9. Fetch Project Shares
projectRouter.get(["/projects/:projectId/shares", "/api/projects/:projectId/shares"], checkAuth, async (request, response) => {
  try {
    const { projectId } = request.params;
    const { data: proj } = await supabase.from("projects").select("owner_id").eq("id", projectId).maybeSingle();
    let owner = null;
    if (proj?.owner_id) {
      const { data: ownerProf } = await supabase.from("profiles").select("id, email, role").eq("id", proj.owner_id).maybeSingle();
      owner = ownerProf;
    }

    const { data: docs } = await supabase.from("documents").select("id").eq("project_id", projectId);
    const docIds = (docs || []).map(d => d.id);

    let collaborators = [];
    if (docIds.length > 0) {
      const { data: shares } = await supabase.from("document_access").select("*, profiles(id, email, role)").in("document_id", docIds);
      const uniqueUsers = new Map();
      (shares || []).forEach(s => {
        if (!uniqueUsers.has(s.user_id)) {
          uniqueUsers.set(s.user_id, {
            userId: s.user_id,
            shareId: s.id,
            email: s.profiles?.email || "",
            fullName: s.profiles?.email || "User",
            accessLevel: s.permission || "editor"
          });
        }
      });
      collaborators = Array.from(uniqueUsers.values());
    }

    response.json({ collaborators, owner });
  } catch (error) {
    console.error("Fetch Project Shares Error:", error);
    response.json({ collaborators: [], owner: null });
  }
});

// 10. Share Project with User by Email
projectRouter.post(["/projects/:projectId/share", "/api/projects/:projectId/share"], checkAuth, async (request, response) => {
  try {
    const { projectId } = request.params;
    const { email, accessLevel = "editor" } = request.body;
    if (!email) return response.status(400).json({ error: "Email is required" });

    const activeTenantId = request.tenant?.id || request.profile?.organization_id;
    const isSuperAdmin = request.profile?.role === "super_admin";

    // 1. Fetch project to verify existence & tenant space
    const { data: project } = await supabase
      .from("projects")
      .select("id, organization_id, owner_id")
      .eq("id", projectId)
      .maybeSingle();

    if (!project) {
      return response.status(404).json({ error: "Project not found." });
    }

    const projectOrgId = project.organization_id || activeTenantId;

    // 2. Parse emails (single string or array of emails)
    const emailList = (Array.isArray(email) ? email : [email])
      .map(e => String(e).trim().toLowerCase())
      .filter(Boolean);

    if (emailList.length === 0) {
      return response.status(400).json({ error: "At least one valid user email is required." });
    }

    const grantedCollaborators = [];
    const { data: docs } = await supabase.from("documents").select("id").eq("project_id", projectId);
    const docIds = (docs || []).map(d => d.id);

    for (const cleanEmail of emailList) {
      const { data: targetUser } = await supabase
        .from("profiles")
        .select("id, email, role, organization_id")
        .ilike("email", cleanEmail)
        .maybeSingle();

      if (!targetUser) {
        return response.status(404).json({ error: `User with email '${cleanEmail}' not found.` });
      }

      // RESTRICT LINGUISTS FROM WHOLE PROJECT ACCESS:
      if (targetUser.role === "linguist") {
        return response.status(400).json({
          error: `User '${cleanEmail}' is registered as a Linguist. Entire project sharing is reserved for Project Coordinators and VerbiLabs Staff. To assign tasks to a linguist, please share specific files or target languages.`
        });
      }

      // STRICT WORKSPACE RESTRICTION:
      let isSameWorkspace = targetUser.organization_id === projectOrgId;
      if (!isSameWorkspace && projectOrgId) {
        const { data: mem } = await supabase
          .from("user_tenant_memberships")
          .select("id")
          .eq("user_id", targetUser.id)
          .eq("organization_id", projectOrgId)
          .maybeSingle();
        if (mem) {
          isSameWorkspace = true;
        }
      }

      if (!isSameWorkspace && !isSuperAdmin && projectOrgId) {
        return response.status(403).json({
          error: `User '${cleanEmail}' does not belong to this workspace space. Projects can only be shared with members of the workspace where the project was created.`
        });
      }

      if (docIds.length > 0) {
        const accessInserts = docIds.map(docId => ({
          document_id: docId,
          user_id: targetUser.id,
          permission: accessLevel === "viewer" ? "read" : "write"
        }));

        await supabase.from("document_access").upsert(accessInserts, { onConflict: "document_id,user_id" });
      }

      grantedCollaborators.push({
        userId: targetUser.id,
        email: targetUser.email,
        fullName: targetUser.email,
        accessLevel
      });
    }

    response.json({
      success: true,
      collaborators: grantedCollaborators,
      collaborator: grantedCollaborators[0] || null
    });
  } catch (error) {
    console.error("Share Project Error:", error);
    response.status(500).json({ error: error.message || "Failed to share project" });
  }
});

// 11. Revoke Project Share
projectRouter.delete(["/projects/:projectId/shares/:targetId", "/api/projects/:projectId/shares/:targetId"], checkAuth, async (request, response) => {
  try {
    const { projectId, targetId } = request.params;
    const { data: docs } = await supabase.from("documents").select("id").eq("project_id", projectId);
    const docIds = (docs || []).map(d => d.id);

    if (docIds.length > 0) {
      await supabase.from("document_access").delete().in("document_id", docIds).eq("user_id", targetId);
    }

    response.json({ success: true, message: "Project access revoked successfully" });
  } catch (error) {
    console.error("Revoke Project Share Error:", error);
    response.status(500).json({ error: "Failed to revoke project share" });
  }
});

// 12. Get Project Public Access
projectRouter.get(["/projects/:id/public-access", "/api/projects/:id/public-access"], checkAuth, async (request, response) => {
  try {
    const { id } = request.params;
    const { data: project } = await supabase.from("projects").select("public_access").eq("id", id).maybeSingle();
    let access = project?.public_access;
    if (!access) {
      const { data: doc } = await supabase.from("documents").select("public_access").eq("project_id", id).limit(1).maybeSingle();
      access = doc?.public_access || "none";
    }
    response.json({ publicAccess: access || "none" });
  } catch (error) {
    console.error("Get Project Public Access Error:", error);
    response.json({ publicAccess: "none" });
  }
});

// 13. Update Project Public Access
projectRouter.put(["/projects/:id/public-access", "/api/projects/:id/public-access"], checkAuth, async (request, response) => {
  try {
    const { id } = request.params;
    const { publicAccess } = request.body;
    const accessVal = publicAccess || "none";

    try {
      await supabase.from("projects").update({ public_access: accessVal }).eq("id", id);
    } catch (_) {}

    response.json({ success: true, publicAccess: accessVal });
  } catch (error) {
    console.error("Update Project Public Access Error:", error);
    response.status(500).json({ error: "Failed to update project public access" });
  }
});

module.exports = {
  projectRouter
};

