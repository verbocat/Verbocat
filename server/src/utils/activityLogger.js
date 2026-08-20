const fs = require("fs");
const path = require("path");
const { supabase } = require("../config/supabase");

const LOGS_DIR = path.join(__dirname, "../../data");
const LOGS_FILE = path.join(LOGS_DIR, "activity_logs.json");

// Ensure data directory exists
function ensureLogDir() {
  try {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
  } catch (err) {
    console.error("[ACTIVITY_LOG] Failed to create data directory:", err.message);
  }
}

// Read raw logs from disk
function readPersistedLogs() {
  try {
    ensureLogDir();
    if (!fs.existsSync(LOGS_FILE)) {
      return [];
    }
    const content = fs.readFileSync(LOGS_FILE, "utf-8");
    if (!content.trim()) return [];
    return JSON.parse(content);
  } catch (err) {
    console.error("[ACTIVITY_LOG] Read error:", err.message);
    return [];
  }
}

// Write logs to disk
function writePersistedLogs(logs) {
  try {
    ensureLogDir();
    // Keep last 1000 items
    const trimmed = logs.slice(0, 1000);
    fs.writeFileSync(LOGS_FILE, JSON.stringify(trimmed, null, 2), "utf-8");
  } catch (err) {
    console.error("[ACTIVITY_LOG] Write error:", err.message);
  }
}

/**
 * Record an audit/activity event
 */
async function recordActivity({
  projectId = null,
  projectName = null,
  eventType,
  details = {},
  userName = "User",
  userId = null,
  organizationId = null
}) {
  try {
    const entry = {
      id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      project_id: projectId,
      projectName: projectName || details.projectName || details.name || null,
      event_type: eventType,
      user_name: userName,
      user_id: userId,
      organization_id: organizationId,
      details: details || {},
      created_at: new Date().toISOString()
    };

    // 1. Persist to local JSON storage
    const currentLogs = readPersistedLogs();
    currentLogs.unshift(entry);
    writePersistedLogs(currentLogs);

    // 2. Best-effort Supabase insert if project_activities table exists
    try {
      if (projectId) {
        await supabase.from("project_activities").insert({
          project_id: projectId,
          event_type: eventType,
          details: details || {},
          user_name: userName
        });
      }
    } catch (_) {
      // Ignore if table does not exist
    }

    return entry;
  } catch (err) {
    console.error("[ACTIVITY_LOG] Failed to record activity:", err);
    return null;
  }
}

/**
 * Fetch and synthesize activities
 */
async function getActivityLogs({ projectId = null, organizationId = null, isSuperAdmin = false } = {}) {
  try {
    const persisted = readPersistedLogs();
    const history = [];
    const seenIds = new Set();

    // 1. Filter persisted logs
    persisted.forEach(item => {
      if (projectId && item.project_id !== projectId) return;
      if (!isSuperAdmin && organizationId && item.organization_id && item.organization_id !== organizationId) return;
      
      seenIds.add(item.id);
      history.push(item);
    });

    // 2. Fetch live projects from Supabase to backfill/supplement PROJECT_CREATED
    try {
      let projsQuery = supabase
        .from("projects")
        .select("*, profiles(email)")
        .order("created_at", { ascending: false })
        .limit(100);

      if (projectId) {
        projsQuery = projsQuery.eq("id", projectId);
      } else if (!isSuperAdmin && organizationId) {
        projsQuery = projsQuery.eq("organization_id", organizationId);
      }

      const { data: projs } = await projsQuery;

      if (projs && projs.length > 0) {
        projs.forEach(proj => {
          const key = `proj_created_${proj.id}`;
          // Check if we already have this project's creation recorded
          const alreadyLogged = history.some(h => 
            h.project_id === proj.id && (h.event_type === "PROJECT_CREATED" || h.event_type === "project_created")
          );

          if (!alreadyLogged && !seenIds.has(key)) {
            seenIds.add(key);
            history.push({
              id: key,
              project_id: proj.id,
              event_type: "PROJECT_CREATED",
              user_name: proj.profiles?.email || "Project Owner",
              projectName: proj.name,
              created_at: proj.created_at,
              organization_id: proj.organization_id,
              details: {
                projectName: proj.name,
                sourceLang: proj.source_lang,
                targetLanguages: proj.target_languages,
                domain: proj.settings?.domain || "General"
              }
            });
          }
        });
      }
    } catch (e) {
      console.warn("[ACTIVITY_LOG] Project query fallback error:", e.message);
    }

    // 3. Fetch live documents from Supabase to backfill FILE_UPLOADED
    try {
      let docsQuery = supabase
        .from("documents")
        .select("*, projects(name, organization_id), profiles(email)")
        .order("created_at", { ascending: false })
        .limit(100);

      if (projectId) {
        docsQuery = docsQuery.eq("project_id", projectId);
      }

      const { data: docs } = await docsQuery;

      if (docs && docs.length > 0) {
        docs.forEach(doc => {
          if (!isSuperAdmin && organizationId && doc.projects?.organization_id && doc.projects.organization_id !== organizationId) return;

          const key = `doc_uploaded_${doc.id}`;
          const alreadyLogged = history.some(h => 
            h.details?.fileId === doc.id || (h.details?.fileName === doc.name && h.project_id === doc.project_id)
          );

          if (!alreadyLogged && !seenIds.has(key)) {
            seenIds.add(key);
            history.push({
              id: key,
              project_id: doc.project_id,
              event_type: "FILE_UPLOADED",
              user_name: doc.profiles?.email || "Coordinator",
              projectName: doc.projects?.name || "Project",
              created_at: doc.created_at,
              details: {
                fileId: doc.id,
                fileName: doc.name,
                fileSize: doc.file_size,
                wordCount: doc.word_count || 0,
                targetLang: doc.target_lang
              }
            });
          }
        });
      }
    } catch (e) {
      console.warn("[ACTIVITY_LOG] Document query fallback error:", e.message);
    }

    // 4. Fetch live shares from Supabase
    try {
      const { data: shares } = await supabase
        .from("document_access")
        .select("*, profiles(email), documents(name, project_id, projects(name, organization_id))")
        .order("created_at", { ascending: false })
        .limit(100);

      if (shares && shares.length > 0) {
        shares.forEach(s => {
          const docProjId = s.documents?.project_id;
          if (projectId && docProjId !== projectId) return;
          if (!isSuperAdmin && organizationId && s.documents?.projects?.organization_id && s.documents.projects.organization_id !== organizationId) return;

          const key = `share_${s.id}`;
          if (!seenIds.has(key)) {
            seenIds.add(key);
            history.push({
              id: key,
              project_id: docProjId,
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
          }
        });
      }
    } catch (e) {
      console.warn("[ACTIVITY_LOG] Share query fallback error:", e.message);
    }

    // Sort all history entries by created_at descending
    history.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    return history;
  } catch (err) {
    console.error("[ACTIVITY_LOG] Error getting logs:", err);
    return [];
  }
}

module.exports = {
  recordActivity,
  getActivityLogs
};
