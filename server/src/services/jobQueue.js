const { supabase, fetchAllSegments } = require("../config/supabase");
const { translateSegments } = require("./translationService");
const { getIo } = require("./socket");

async function logJobQueueActivity(projectId, eventType, details, userName = "AI Translator") {
  try {
    const { error } = await supabase
      .from("project_activities")
      .insert({
        project_id: projectId,
        event_type: eventType,
        details: details || {},
        user_name: userName
      });
    if (error) {
      // Fallback: append to project settings JSONB
      if (error.code === 'PGRST205' || error.message.includes("project_activities") || error.message.includes("does not exist")) {
        const { data: project } = await supabase.from("projects").select("settings").eq("id", projectId).single();
        if (project) {
          const currentSettings = project.settings || {};
          const activities = currentSettings.activities || [];
          activities.unshift({
            id: Math.random().toString(36).substr(2, 9),
            project_id: projectId,
            event_type: eventType,
            details: details || {},
            user_name: userName,
            created_at: new Date().toISOString()
          });
          await supabase.from("projects").update({ settings: { ...currentSettings, activities } }).eq("id", projectId);
        }
      }
    }
  } catch (e) {
    console.error("Failed to log activity in queue worker:", e);
  }
}


let workerInterval = null;
let isProcessing = false;

// Concurrency limit
const MAX_CONCURRENT_JOBS = 2;
let activeJobCount = 0;

/**
 * Initialize and start the background queue worker.
 */
function startQueueWorker() {
  if (workerInterval) return;
  console.log("[JobQueue] Starting background translation queue worker...");
  
  // Poll for pending jobs every 4 seconds
  workerInterval = setInterval(async () => {
    if (activeJobCount >= MAX_CONCURRENT_JOBS) return;
    await processNextJob();
  }, 4000);
}

/**
 * Query the next pending job and execute it.
 */
async function processNextJob() {
  if (isProcessing) return; // Prevent overlapping polls
  isProcessing = true;

  try {
    const { data: jobs, error } = await supabase
      .from("translation_jobs")
      .select("*, projects(source_lang)")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1);

    if (error) {
      console.error("[JobQueue] Error fetching pending jobs:", error);
      return;
    }

    if (jobs && jobs.length > 0) {
      const job = jobs[0];
      activeJobCount++;
      // Execute asynchronously
      runJob(job).catch((err) => {
        console.error(`[JobQueue] Fatal error in job ${job.id}:`, err);
      }).finally(() => {
        activeJobCount--;
      });
    }
  } catch (err) {
    console.error("[JobQueue] Exception in processNextJob:", err);
  } finally {
    isProcessing = false;
  }
}

/**
 * Execute a translation job chunk-by-chunk.
 */
async function runJob(job) {
  console.log(`[JobQueue] Starting Translation Job: ${job.id} for document ${job.document_id} (${job.target_lang})`);

  // 1. Mark job as running
  await updateJobStatus(job.id, "running", { error_message: null });

  try {
    // 2. Fetch document details to get file_id and verify owner
    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("*")
      .eq("id", job.document_id)
      .single();

    if (docErr || !doc) {
      throw new Error(docErr?.message || "Document not found");
    }

    // 3. Resolve context settings (Segment -> File -> Project priority)
    // Fetch project settings
    const { data: project } = await supabase
      .from("projects")
      .select("settings, source_lang")
      .eq("id", job.project_id)
      .single();

    // Fetch file/document context settings (if stored in document settings/metadata)
    // The current context settings are stored in local storage or en-route.
    // We default to merging project settings.
    const projectSettings = project?.settings || {};
    const sourceLang = project?.source_lang || doc.source_lang || "en";

    // 4. Fetch all segments for this specific target language job
    const dbSegments = await fetchAllSegments(job.document_id, "*", job.target_lang);
    if (!dbSegments || dbSegments.length === 0) {
      // If language segments don't exist yet, we initialize them from the source template segments
      const sourceSegments = await fetchAllSegments(job.document_id, "*", "source");
      if (!sourceSegments || sourceSegments.length === 0) {
        throw new Error("Source template segments missing. Cannot initialize translation job.");
      }

      // Initialize segments for this target language
      const segmentInserts = sourceSegments.map((seg) => ({
        document_id: job.document_id,
        target_lang: job.target_lang,
        segment_index: seg.segment_index,
        source_text: seg.source_text,
        target_text: "",
        status: "draft"
      }));

      const { error: insertErr } = await supabase
        .from("document_segments")
        .insert(segmentInserts);

      if (insertErr) {
        throw new Error(`Failed to initialize job segments: ${insertErr.message}`);
      }

      // Re-fetch
      dbSegments.push(...segmentInserts);
    }

    const totalSegments = dbSegments.length;
    let completedSegments = dbSegments.filter(s => s.target_text && s.target_text.trim() !== "").length;

    // 5. Update initial progress
    let progress = Math.round((completedSegments / totalSegments) * 100);
    await updateJobProgress(job.id, progress);

    // Filter segments that still need translation
    const pendingSegments = dbSegments.filter(
      s => !s.target_text || s.target_text.replace(/<\/?\d+>/g, "").trim() === ""
    );

    // Group pending segments into chunks of 15 for execution
    const CHUNK_SIZE = 15;
    const chunks = [];
    for (let i = 0; i < pendingSegments.length; i += CHUNK_SIZE) {
      chunks.push(pendingSegments.slice(i, i + CHUNK_SIZE));
    }

    console.log(`[JobQueue] Job ${job.id}: ${pendingSegments.length} of ${totalSegments} segments remaining. Chunk count: ${chunks.length}`);

    // Process chunk-by-chunk
    for (let i = 0; i < chunks.length; i++) {
      // Re-check job status (to handle pause/cancel in real-time)
      const currentJob = await getJobDetails(job.id);
      if (!currentJob) {
        console.log(`[JobQueue] Job ${job.id} deleted. Aborting.`);
        return;
      }

      if (currentJob.status === "paused") {
        console.log(`[JobQueue] Job ${job.id} paused. Suspending worker execution.`);
        broadcastJobStatus(job.id, job.document_id, "paused", progress);
        return;
      }

      if (currentJob.status === "cancelled" || currentJob.status === "failed") {
        console.log(`[JobQueue] Job ${job.id} cancelled/failed externally. Aborting.`);
        return;
      }

      const chunk = chunks[i];
      const segmentsToTranslate = chunk.map(s => ({
        id: s.segment_index + 1, // 1-indexed for translation provider compatibility
        source: s.source_text,
        target: s.target_text
      }));

      // Execute translation chunk
      const { results } = await translateSegments(
        segmentsToTranslate,
        job.target_lang,
        sourceLang,
        { ...projectSettings, fileExtension: doc.file_extension || "" },
        doc.owner_id
      );

      // Save translated results back to DB
      const updatePromises = results.map(async (item) => {
        const segmentIndex = item.id - 1;

        const updateFields = {
          target_text: item.translated || "",
          status: item.translated ? "translated" : "draft",
          mqm_accuracy_score: item.mqmAccuracyScore !== undefined ? item.mqmAccuracyScore : 100,
          mqm_report: item.mqmReport || null,
          updated_at: new Date().toISOString()
        };

        return supabase
          .from("document_segments")
          .update(updateFields)
          .eq("document_id", job.document_id)
          .eq("target_lang", job.target_lang)
          .eq("segment_index", segmentIndex);
      });

      await Promise.all(updatePromises);

      completedSegments += chunk.length;
      progress = Math.min(100, Math.round((completedSegments / totalSegments) * 100));

      await updateJobProgress(job.id, progress);
    }

    // 6. Complete job
    await updateJobStatus(job.id, "completed", { progress: 100 });
    console.log(`[JobQueue] Translation Job ${job.id} completed successfully.`);

  } catch (err) {
    console.error(`[JobQueue] Error running job ${job.id}:`, err);
    await updateJobStatus(job.id, "failed", { error_message: err.message });
  }
}

/**
 * DB Helper to get current job state.
 */
async function getJobDetails(jobId) {
  const { data, error } = await supabase
    .from("translation_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (error || !data) return null;
  return data;
}

/**
 * DB Helper to update job status and broadcast it.
 */
async function updateJobStatus(jobId, status, extraFields = {}) {
  const { data, error } = await supabase
    .from("translation_jobs")
    .update({
      status,
      updated_at: new Date().toISOString(),
      ...extraFields
    })
    .eq("id", jobId)
    .select()
    .single();

  if (error) {
    console.error(`[JobQueue] Failed to update job status for ${jobId}:`, error);
    return;
  }

  if (status === "completed" && data) {
    try {
      let docName = "Document";
      const { data: doc } = await supabase
        .from("documents")
        .select("name")
        .eq("id", data.document_id)
        .single();
      if (doc) docName = doc.name;

      await logJobQueueActivity(data.project_id, "translation_completed", {
        jobId,
        fileName: docName,
        targetLang: data.target_lang
      });
    } catch (logErr) {
      console.error("[JobQueue] Error logging translation completion:", logErr);
    }
  }

  broadcastJobStatus(jobId, data.document_id, status, data.progress, data.error_message);
}

/**
 * DB Helper to update job progress.
 */
async function updateJobProgress(jobId, progress) {
  const { data, error } = await supabase
    .from("translation_jobs")
    .update({
      progress,
      updated_at: new Date().toISOString()
    })
    .eq("id", jobId)
    .select()
    .single();

  if (error) {
    console.error(`[JobQueue] Failed to update progress for job ${jobId}:`, error);
    return;
  }

  broadcastJobStatus(jobId, data.document_id, data.status, progress);
}

/**
 * Broadcast status changes to frontend client rooms via socket.io.
 */
function broadcastJobStatus(jobId, documentId, status, progress, errorMessage = null) {
  try {
    const io = getIo();
    if (!io) return;

    // Broadcast to the document room
    io.to(documentId).emit("job-status-changed", {
      jobId,
      documentId,
      status,
      progress,
      errorMessage
    });

    // Also broadcast a global update event for dashboards
    io.emit("global-job-update", {
      jobId,
      documentId,
      status,
      progress,
      errorMessage
    });
  } catch (err) {
    console.error("[JobQueue] Socket broadcast error:", err);
  }
}

module.exports = {
  startQueueWorker,
  broadcastJobStatus
};
