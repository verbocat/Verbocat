const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { supabase } = require("../config/supabase");
const { checkAuth } = require("../utils/authMiddleware");
const { processUploadedFile } = require("../services/fileService");
const { recordActivity, getActivityLogs } = require("../utils/activityLogger");
const { getIo } = require("../services/socket");

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
      .select("*, documents(*), translation_jobs(*)")
      .order("created_at", { ascending: false });

    if (!isSuperAdmin && activeTenantId) {
      query = query.eq("organization_id", activeTenantId);
    }

    const { data: projects, error } = await query;
    if (error) throw error;

    const enrichProject = (p) => {
      const docs = p.documents || [];
      const jobs = p.translation_jobs || [];
      const totalWords = docs.reduce((sum, d) => sum + (d.word_count || 0), 0);
      const progress = jobs.length > 0
        ? Math.round(jobs.reduce((sum, j) => sum + (j.progress || 0), 0) / jobs.length)
        : 0;
      return {
        ...p,
        status: p.status || p.settings?.status || "active",
        totalWords,
        progress,
        documentsCount: docs.length
      };
    };

    // PRIVATE PROJECT SCOPING:
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

      const filteredProjects = (projects || [])
        .filter(p => p.owner_id === userId || sharedProjectIds.has(p.id))
        .map(enrichProject);

      return response.json({ projects: filteredProjects });
    }

    const enrichedProjects = (projects || []).map(enrichProject);
    response.json({ projects: enrichedProjects });
  } catch (error) {
    console.error("List Projects Error:", error);
    response.status(500).json({ error: "Failed to fetch projects" });
  }
});

// 2. Create Project
projectRouter.post(["/projects", "/api/projects"], checkAuth, upload.single("referenceFile"), async (request, response) => {
  try {
    let {
      name,
      client,
      status,
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

    if (typeof target_languages === "string") {
      try { target_languages = JSON.parse(target_languages); } catch (_) {}
    }
    if (typeof targetLanguages === "string") {
      try { targetLanguages = JSON.parse(targetLanguages); } catch (_) {}
    }
    if (typeof settings === "string") {
      try { settings = JSON.parse(settings); } catch (_) {}
    }

    const sLang = source_lang || sourceLanguage || "en";
    const tLangRaw = target_languages || targetLanguages || target_lang || ["hi"];
    const tLangsArray = Array.isArray(tLangRaw) ? tLangRaw : [tLangRaw];

    if (tLangsArray.includes(sLang)) {
      return response.status(400).json({ error: "Source and target language cannot be the same." });
    }

    const dDate = due_date || deadline || dueDate || null;
    const projDescription = description || notes || "";
    const projStatus = status || (settings && settings.status) || "active";
    const mergedSettings = { ...(settings || {}), due_date: dDate, status: projStatus };

    // If reference file was uploaded, extract text & sample context
    if (request.file) {
      try {
        const { extractTextFromReferenceFile, analyzeReferenceContext } = require("../utils/referenceSampler");
        const fullText = await extractTextFromReferenceFile(request.file.path);
        if (fullText) {
          const analysis = await analyzeReferenceContext(fullText, request.file.originalname);
          mergedSettings.referenceFileName = request.file.originalname;
          mergedSettings.referenceContext = analysis.referenceContext || "";
          mergedSettings.domain = analysis.domain || mergedSettings.domain || "General";
          mergedSettings.tone = analysis.tone || "Formal";
        }
      } catch (refErr) {
        console.warn("[PROJECT_CREATE] Reference file sampling warning:", refErr.message);
      } finally {
        try { fs.unlinkSync(request.file.path); } catch (_) {}
      }
    }

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

    // Record PROJECT_CREATED audit log
    recordActivity({
      projectId: project.id,
      projectName: project.name,
      eventType: "PROJECT_CREATED",
      details: {
        projectName: project.name,
        sourceLang: sLang,
        targetLanguages: tLangsArray,
        domain: mergedSettings.domain || "General",
        status: projStatus
      },
      userName: request.user?.email || request.profile?.email || "Project Owner",
      userId: userId,
      organizationId: activeTenantId
    });

    response.json({ project });
  } catch (error) {
    console.error("Create Project Error:", error);
    response.status(500).json({ error: error.message || "Failed to create project" });
  }
});

// 2.5 Fetch Global Audit History (MUST BE DECLARED BEFORE /projects/:id TO PREVENT ROUTE TRAPPING)
projectRouter.get(["/projects/history", "/api/projects/history"], checkAuth, async (request, response) => {
  try {
    const activeTenantId = request.tenant?.id || request.profile?.organization_id;
    const isSuperAdmin = request.profile?.role === "super_admin";

    const history = await getActivityLogs({
      organizationId: activeTenantId,
      isSuperAdmin
    });

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

    // Fetch jobs belonging to this project from translation_jobs
    const { data: jobs } = await supabase
      .from("translation_jobs")
      .select("*, documents(*)")
      .eq("project_id", id)
      .order("created_at", { ascending: false });

    const targetLangs = Array.isArray(project.target_languages) && project.target_languages.length > 0
      ? project.target_languages
      : (Array.isArray(project.target_lang) ? project.target_lang : [project.target_lang || "hi"]);

    const filesList = docs && docs.length > 0 ? docs : (project.documents || []);
    let activeJobs = jobs || [];

    // Auto-sync word_count and job progress for each document if missing
    for (const doc of filesList) {
      const { data: segs } = await supabase
        .from("document_segments")
        .select("source_text, target_text, target_lang, status")
        .eq("document_id", doc.id);

      const templateSegs = (segs || []).filter(s => !s.target_lang || s.target_lang === null);
      const countableSegs = templateSegs.length > 0 ? templateSegs : (segs || []);

      const calculatedWordCount = countableSegs.reduce((acc, s) => {
        const clean = (s.source_text || "")
          .replace(/<[^>]+>/g, " ")
          .replace(/__TAG_\d+__/g, " ")
          .replace(/&nbsp;/g, " ")
          .trim();
        return acc + (clean && /[\p{L}\p{N}]/u.test(clean) ? clean.split(/\s+/).filter(Boolean).length : 0);
      }, 0);

      if (calculatedWordCount > 0 && (!doc.word_count || doc.word_count === 0)) {
        doc.word_count = calculatedWordCount;
        await supabase.from("documents").update({ word_count: calculatedWordCount }).eq("id", doc.id);
      }

      // Ensure jobs exist for all configured target languages and have accurate progress
      for (const tLang of targetLangs) {
        let job = activeJobs.find(j => j.document_id === doc.id && j.target_lang === tLang);
        const translatedCount = (segs || []).filter(s => s.target_lang === tLang && s.target_text && s.target_text.trim() !== "").length;
        const totalCountable = countableSegs.length;
        const computedProgress = totalCountable > 0 ? Math.round((translatedCount / totalCountable) * 100) : 0;
        const computedStatus = computedProgress === 100 ? "completed" : (computedProgress > 0 ? "in_progress" : "pending");

        if (!job) {
          const { data: createdJob } = await supabase
            .from("translation_jobs")
            .insert({
              project_id: id,
              document_id: doc.id,
              target_lang: tLang,
              status: computedStatus,
              progress: computedProgress,
              word_count: doc.word_count || calculatedWordCount,
              organization_id: activeTenantId || project.organization_id
            })
            .select("*, documents(*)")
            .single();

          if (createdJob) {
            activeJobs.push(createdJob);
          }
        } else if (job.progress !== computedProgress || job.word_count !== (doc.word_count || calculatedWordCount)) {
          job.progress = computedProgress;
          job.status = computedStatus;
          job.word_count = doc.word_count || calculatedWordCount;
          await supabase
            .from("translation_jobs")
            .update({ progress: computedProgress, status: computedStatus, word_count: job.word_count })
            .eq("id", job.id);
        }
      }
    }

    response.json({
      project,
      files: filesList,
      jobs: activeJobs
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
      console.log(`[PROJECT_UPLOAD_STEP 1/5 SUCCESS] Project verified! Name: "${project.name}" | Target Langs: ${JSON.stringify(project.target_lang || project.target_languages)}`);

      // 2. Parse uploaded file using processUploadedFile
      const parseStartTime = Date.now();
      console.log(`[PROJECT_UPLOAD_STEP 2/5] Parsing file content and extracting segments...`);
      const result = await processUploadedFile(request.file);
      const parseTimeMs = Date.now() - parseStartTime;
      const documentId = result.fileId;
      console.log(`[PROJECT_UPLOAD_STEP 2/5 SUCCESS] File parsed in ${parseTimeMs}ms! DocId: ${documentId} | Total Segments: ${result.segments.length}`);

      // Calculate total word count from parsed segments
      const totalWordCount = (result.segments || []).reduce((sum, seg) => {
        const clean = (seg.source || seg.source_text || "")
          .replace(/<[^>]+>/g, " ")
          .replace(/__TAG_\d+__/g, " ")
          .replace(/&nbsp;/g, " ")
          .trim();
        return sum + (clean && /[\p{L}\p{N}]/u.test(clean) ? clean.split(/\s+/).filter(Boolean).length : 0);
      }, 0);

      // 3. Create document record bound to project_id and organization_id
      const dbStartTime = Date.now();
      console.log(`[PROJECT_UPLOAD_STEP 3/5] Creating document record in "documents" table (Words: ${totalWordCount})...`);
      const { data: docRecord, error: docError } = await supabase
        .from("documents")
        .insert({
          id: documentId,
          name: result.originalName || request.file.originalname || "Untitled Document",
          owner_id: userId,
          file_id: documentId,
          project_id: projectId,
          source_lang: project.source_lang || "en",
          target_lang: Array.isArray(project.target_languages) && project.target_languages[0] ? project.target_languages[0] : (project.target_lang || "hi"),
          organization_id: activeTenantId,
          word_count: totalWordCount,
          file_size: request.file.size || 0,
          status: "active"
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

      // 5. Create translation_jobs records for target languages
      const targetLangs = Array.isArray(project.target_languages) && project.target_languages.length > 0
        ? project.target_languages
        : (Array.isArray(project.target_lang) ? project.target_lang : [project.target_lang || "hi"]);

      console.log(`[PROJECT_UPLOAD_STEP 5/5] Creating job records in translation_jobs for target languages: ${targetLangs.join(', ')}...`);
      const jobsToInsert = targetLangs.map(lang => ({
        project_id: projectId,
        document_id: documentId,
        target_lang: lang,
        status: "pending",
        progress: 0,
        word_count: totalWordCount,
        organization_id: activeTenantId
      }));

      let createdJobs = [];
      const { data: insertedJobs, error: jobErr } = await supabase
        .from("translation_jobs")
        .insert(jobsToInsert)
        .select("*, documents(*)");

      if (!jobErr && insertedJobs) {
        createdJobs = insertedJobs;
      }
      console.log(`[PROJECT_UPLOAD_STEP 5/5 SUCCESS] Created ${createdJobs.length} translation jobs!`);

      // Record FILE_UPLOADED audit log
      recordActivity({
        projectId,
        projectName: project.name,
        eventType: "FILE_UPLOADED",
        details: {
          fileId: docRecord.id,
          fileName: request.file.originalname,
          fileSize: request.file.size,
          wordCount: totalWordCount
        },
        userName: request.user?.email || request.profile?.email || "Project Coordinator",
        userId: request.user.id,
        organizationId: activeTenantId
      });

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
    const activeTenantId = request.tenant?.id || request.profile?.organization_id;
    const isSuperAdmin = request.profile?.role === "super_admin";

    const activities = await getActivityLogs({
      projectId,
      organizationId: activeTenantId,
      isSuperAdmin
    });

    response.json({ activities });
  } catch (error) {
    console.error("Fetch Project Activities Error:", error);
    response.json({ activities: [] });
  }
});

// 6. Fetch Project Analytics
projectRouter.get(["/projects/:projectId/analytics", "/api/projects/:projectId/analytics"], checkAuth, async (request, response) => {
  try {
    const { projectId } = request.params;
    const { data: project } = await supabase.from("projects").select("target_lang, target_languages").eq("id", projectId).maybeSingle();
    const targetLangs = Array.isArray(project?.target_languages) && project.target_languages.length > 0
      ? project.target_languages
      : (Array.isArray(project?.target_lang) ? project.target_lang : [project?.target_lang || "hi"]);

    const { data: docs } = await supabase
      .from("documents")
      .select("id, name, word_count")
      .eq("project_id", projectId);

    const docIds = (docs || []).map(d => d.id);
    let totalTemplateSegments = 0;
    let translatedSegments = 0;

    if (docIds.length > 0) {
      const { data: segs } = await supabase
        .from("document_segments")
        .select("source_text, target_text, target_lang, status")
        .in("document_id", docIds);

      if (segs && segs.length > 0) {
        const templateSegs = segs.filter(s => !s.target_lang || s.target_lang === null);
        const countableCount = templateSegs.length > 0 ? templateSegs.length : Math.round(segs.length / Math.max(1, targetLangs.length));
        totalTemplateSegments = Math.round(countableCount * targetLangs.length);

        translatedSegments = segs.filter(s => s.target_lang && s.target_text && s.target_text.trim() !== "").length;
      }
    }

    const completionRate = totalTemplateSegments > 0 ? Math.round((translatedSegments / totalTemplateSegments) * 100) : 0;

    response.json({
      totalDocuments: docIds.length,
      totalSegments: totalTemplateSegments,
      translatedSegments,
      completionRate
    });
  } catch (error) {
    console.error("Analytics Error:", error);
    response.json({ totalDocuments: 0, totalSegments: 0, translatedSegments: 0, completionRate: 0 });
  }
});

// 7. Update Project
projectRouter.put(["/projects/:id", "/api/projects/:id"], checkAuth, async (request, response) => {
  try {
    const { id } = request.params;
    let { name, status, due_date, dueDate, notes, description, client, sourceLanguage, source_lang, targetLanguages, target_languages, settings } = request.body;
    const activeTenantId = request.tenant?.id || request.profile?.organization_id;
    const isSuperAdmin = request.profile?.role === "super_admin";

    const { data: currProject } = await supabase.from("projects").select("*").eq("id", id).single();
    const currSettings = currProject?.settings || {};

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (client !== undefined) updateData.client = client.trim();
    if (description !== undefined || notes !== undefined) {
      updateData.description = description || notes || "";
    }
    if (source_lang !== undefined || sourceLanguage !== undefined) {
      updateData.source_lang = source_lang || sourceLanguage;
    }

    const rawTargetLangs = target_languages || targetLanguages;
    if (rawTargetLangs !== undefined) {
      let parsedTargetLangs = rawTargetLangs;
      if (typeof rawTargetLangs === "string") {
        try { parsedTargetLangs = JSON.parse(rawTargetLangs); } catch (_) { parsedTargetLangs = [rawTargetLangs]; }
      }
      if (Array.isArray(parsedTargetLangs)) {
        updateData.target_languages = parsedTargetLangs;
      }
    }

    const newSettings = { ...currSettings, ...(settings || {}) };
    if (status !== undefined) {
      newSettings.status = status;
    }
    const finalDueDate = due_date || dueDate;
    if (finalDueDate !== undefined) newSettings.due_date = finalDueDate;
    updateData.settings = newSettings;
    updateData.updated_at = new Date().toISOString();

    let query = supabase.from("projects").update(updateData).eq("id", id);
    if (!isSuperAdmin && activeTenantId) {
      query = query.eq("organization_id", activeTenantId);
    }

    const { data: updatedProject, error } = await query.select().single();
    if (error) throw error;

    // If target languages were updated, ensure translation_jobs exist for new target languages
    if (updateData.target_languages && Array.isArray(updateData.target_languages)) {
      const { data: projectDocs } = await supabase.from("documents").select("id, word_count").eq("project_id", id);
      for (const doc of projectDocs || []) {
        for (const tLang of updateData.target_languages) {
          const { data: existingJob } = await supabase
            .from("translation_jobs")
            .select("id")
            .eq("document_id", doc.id)
            .eq("target_lang", tLang)
            .maybeSingle();

          if (!existingJob) {
            await supabase.from("translation_jobs").insert({
              project_id: id,
              document_id: doc.id,
              target_lang: tLang,
              status: "pending",
              progress: 0,
              word_count: doc.word_count || 0,
              organization_id: activeTenantId || currProject.organization_id
            });
          }
        }
      }
    }

    if (status !== undefined || name !== undefined) {
      recordActivity({
        projectId: id,
        projectName: updatedProject?.name || currProject?.name || "Project",
        eventType: "PROJECT_UPDATED",
        details: {
          projectName: updatedProject?.name || currProject?.name || "Project",
          action: status !== undefined ? `Changed status to "${status}"` : `Renamed project to "${name}"`,
          status
        },
        userName: request.user?.email || request.profile?.email || "Project Coordinator",
        userId: request.user.id,
        organizationId: activeTenantId
      });
    }

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

    // 1. Fetch project details before deletion to preserve in audit trail
    const { data: currProject } = await supabase
      .from("projects")
      .select("id, name, source_lang, target_languages")
      .eq("id", id)
      .maybeSingle();

    const deletedProjName = currProject?.name || "Project";

    // 2. Perform deletion
    let query = supabase.from("projects").delete().eq("id", id);
    if (!isSuperAdmin && activeTenantId) {
      query = query.eq("organization_id", activeTenantId);
    }

    const { error } = await query;
    if (error) throw error;

    // 3. Record PROJECT_DELETED audit log
    recordActivity({
      projectId: id,
      projectName: deletedProjName,
      eventType: "PROJECT_DELETED",
      details: {
        projectName: deletedProjName,
        sourceLang: currProject?.source_lang,
        targetLanguages: currProject?.target_languages,
        deletedAt: new Date().toISOString()
      },
      userName: request.user?.email || request.profile?.email || "Project Owner",
      userId: request.user.id,
      organizationId: activeTenantId
    });

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
    const { data: proj } = await supabase.from("projects").select("owner_id, settings").eq("id", projectId).maybeSingle();
    let owner = null;
    if (proj?.owner_id) {
      const { data: ownerProf } = await supabase.from("profiles").select("id, email, role").eq("id", proj.owner_id).maybeSingle();
      owner = ownerProf;
    }

    const { data: docs } = await supabase.from("documents").select("id").eq("project_id", projectId);
    const docIds = (docs || []).map(d => d.id);
    const jobAssignments = proj?.settings?.jobAssignments || {};

    let collaborators = [];
    if (docIds.length > 0) {
      const { data: shares } = await supabase.from("document_access").select("*, profiles(id, email, role)").in("document_id", docIds);
      const uniqueUsers = new Map();
      (shares || []).forEach(s => {
        const userEmail = s.profiles?.email || "";
        let assignedTargetLang = null;
        for (const [key, val] of Object.entries(jobAssignments)) {
          if (val.userId === s.user_id || val.email?.toLowerCase() === userEmail.toLowerCase()) {
            assignedTargetLang = val.targetLang;
            break;
          }
        }

        if (!uniqueUsers.has(s.user_id)) {
          uniqueUsers.set(s.user_id, {
            id: s.id,
            accessId: s.id,
            shareId: s.id,
            userId: s.user_id,
            email: userEmail,
            fullName: s.profiles?.email || "User",
            role: s.profiles?.role || "linguist",
            permission: s.permission || "write",
            accessLevel: s.permission || "editor",
            targetLang: assignedTargetLang,
            createdAt: s.created_at
          });
        }
      });
      collaborators = Array.from(uniqueUsers.values());
    }

    response.json({ shares: collaborators, collaborators, owner });
  } catch (error) {
    console.error("Fetch Project Shares Error:", error);
    response.json({ shares: [], collaborators: [], owner: null });
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
        // Auto-create profile if giving access to a new user email
        const { data: newProf, error: createErr } = await supabase
          .from("profiles")
          .insert({
            email: cleanEmail,
            role: "linguist",
            status: "active",
            organization_id: projectOrgId
          })
          .select("id, email, role, organization_id")
          .single();

        if (!createErr && newProf) {
          targetUser = newProf;
        } else {
          return response.status(404).json({ error: `User with email '${cleanEmail}' not found.` });
        }
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
          error: `User '${cleanEmail}' does not belong to this workspace. Projects can only be shared with members of the workspace where the project was created.`
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

// 14. Get Project Access Requests (Pending requests for all documents in project)
projectRouter.get(["/projects/:projectId/access-requests", "/api/projects/:projectId/access-requests"], checkAuth, async (request, response) => {
  try {
    const { projectId } = request.params;
    const { data: proj, error: projErr } = await supabase
      .from("projects")
      .select("id, owner_id, settings")
      .eq("id", projectId)
      .maybeSingle();

    if (projErr || !proj) {
      return response.status(404).json({ error: "Project not found." });
    }

    const isOwnerOrStaff = proj.owner_id === request.user.id || ["admin", "super_admin", "verbolabs_staff"].includes(request.profile?.role);
    if (!isOwnerOrStaff) {
      return response.status(403).json({ error: "Only project owners and managers can view access requests." });
    }

    const accessRequests = proj.settings?.accessRequests || {};
    const pendingList = Object.values(accessRequests).filter(r => r.status === "pending");

    // Also sync with database table document_access_requests for all documents in this project
    const { data: docs } = await supabase.from("documents").select("id, name").eq("project_id", projectId);
    const docMap = new Map((docs || []).map(d => [d.id, d.name]));
    const docIds = Array.from(docMap.keys());

    if (docIds.length > 0) {
      const { data: dbReqs } = await supabase
        .from("document_access_requests")
        .select("*, profiles(id, email, full_name)")
        .in("document_id", docIds)
        .eq("status", "pending");

      (dbReqs || []).forEach(dReq => {
        const alreadyInPending = pendingList.some(r => r.documentId === dReq.document_id && r.userId === dReq.user_id);
        if (!alreadyInPending) {
          pendingList.push({
            id: dReq.id,
            documentId: dReq.document_id,
            documentName: docMap.get(dReq.document_id) || "Document",
            targetLang: null,
            userId: dReq.user_id,
            userEmail: dReq.profiles?.email || "User",
            userName: dReq.profiles?.full_name || dReq.profiles?.email?.split("@")[0] || "Linguist",
            permission: "write",
            status: "pending",
            createdAt: dReq.created_at
          });
        }
      });
    }

    // Sort newest first
    pendingList.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    return response.json({ requests: pendingList });
  } catch (error) {
    console.error("Get Project Access Requests Error:", error);
    return response.status(500).json({ error: "Failed to fetch project access requests" });
  }
});

// 15. Respond to Project Access Request (Approve or Reject for specific language)
projectRouter.post(["/projects/:projectId/access-requests/:requestId/respond", "/api/projects/:projectId/access-requests/:requestId/respond"], checkAuth, async (request, response) => {
  try {
    const { projectId, requestId } = request.params;
    const { action, permission = "write", targetLang } = request.body; // action: 'approve' or 'reject'

    const { data: proj, error: projErr } = await supabase
      .from("projects")
      .select("id, owner_id, settings")
      .eq("id", projectId)
      .maybeSingle();

    if (projErr || !proj) {
      return response.status(404).json({ error: "Project not found." });
    }

    const isOwnerOrStaff = proj.owner_id === request.user.id || ["admin", "super_admin", "verbolabs_staff"].includes(request.profile?.role);
    if (!isOwnerOrStaff) {
      return response.status(403).json({ error: "Only project owners and managers can respond to access requests." });
    }

    const projSettings = proj.settings || {};
    const accessRequests = { ...(projSettings.accessRequests || {}) };
    const jobAssignments = { ...(projSettings.jobAssignments || {}) };
    const linguistAssignments = { ...(projSettings.linguistAssignments || {}) };

    let targetRequest = null;
    let targetKey = null;

    for (const [key, reqObj] of Object.entries(accessRequests)) {
      if (reqObj.id === requestId || key.includes(requestId)) {
        targetRequest = reqObj;
        targetKey = key;
        break;
      }
    }

    // Fallback lookup in document_access_requests table if not in settings map
    if (!targetRequest) {
      const { data: dbReq } = await supabase
        .from("document_access_requests")
        .select("*, profiles(id, email, full_name)")
        .eq("id", requestId)
        .maybeSingle();

      if (dbReq) {
        targetRequest = {
          id: dbReq.id,
          documentId: dbReq.document_id,
          targetLang: targetLang || null,
          userId: dbReq.user_id,
          userEmail: dbReq.profiles?.email,
          permission: permission || "write",
          status: "pending"
        };
      }
    }

    if (!targetRequest) {
      return response.status(404).json({ error: "Access request not found." });
    }

    const newStatus = action === "approve" ? "approved" : "rejected";
    const effectiveTargetLang = targetLang || targetRequest.targetLang || null;
    const effectivePermission = permission || targetRequest.permission || "write";

    // 1. Update project settings accessRequests map
    if (targetKey) {
      accessRequests[targetKey] = {
        ...targetRequest,
        status: newStatus,
        respondedAt: new Date().toISOString(),
        respondedBy: request.user.id
      };
    }

    // 2. If approved, add assignments to project settings
    if (action === "approve") {
      // Upsert into document_access table
      await supabase
        .from("document_access")
        .upsert(
          {
            document_id: targetRequest.documentId,
            user_id: targetRequest.userId,
            permission: effectivePermission
          },
          { onConflict: "document_id,user_id" }
        );

      if (effectiveTargetLang) {
        const assignKey = `${targetRequest.documentId}_${effectiveTargetLang}`;
        jobAssignments[assignKey] = {
          userId: targetRequest.userId,
          email: targetRequest.userEmail,
          targetLang: effectiveTargetLang,
          permission: effectivePermission,
          assignedAt: new Date().toISOString()
        };

        const userList = [...(linguistAssignments[targetRequest.userId] || [])];
        const exists = userList.some(item => item.documentId === targetRequest.documentId && item.targetLang === effectiveTargetLang);
        if (!exists) {
          userList.push({
            documentId: targetRequest.documentId,
            targetLang: effectiveTargetLang,
            permission: effectivePermission
          });
        }
        linguistAssignments[targetRequest.userId] = userList;
      }
    }

    // Save updated project settings
    await supabase.from("projects").update({
      settings: {
        ...projSettings,
        accessRequests,
        jobAssignments,
        linguistAssignments
      }
    }).eq("id", projectId);

    // 3. Update status in document_access_requests table
    await supabase
      .from("document_access_requests")
      .update({ status: newStatus })
      .eq("document_id", targetRequest.documentId)
      .eq("user_id", targetRequest.userId);

    // 4. Real-time socket events
    try {
      const io = getIo();
      if (io) {
        // Notify the linguist directly
        io.to(`user:${targetRequest.userId}`).emit("access-request-responded", {
          documentId: targetRequest.documentId,
          projectId,
          targetLang: effectiveTargetLang,
          action,
          userId: targetRequest.userId,
          permission: effectivePermission
        });

        // Notify project room to update badge and list
        io.to(`project:${projectId}`).emit("access-request-processed", {
          requestId,
          action,
          userId: targetRequest.userId,
          documentId: targetRequest.documentId
        });

        io.to(`user:${request.user.id}`).emit("access-request-processed", {
          requestId,
          action
        });
      }
    } catch (socketErr) {
      console.error("Socket emit error on project respond-request:", socketErr);
    }

    return response.json({
      success: true,
      status: newStatus,
      message: `Access request ${action === "approve" ? "approved" : "rejected"} successfully.`
    });
  } catch (error) {
    console.error("Respond Project Access Request Error:", error);
    return response.status(500).json({ error: "Failed to respond to access request" });
  }
});

module.exports = {
  projectRouter
};

