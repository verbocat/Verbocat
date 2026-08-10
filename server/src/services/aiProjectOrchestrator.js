const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { supabase, fetchAllSegments } = require("../config/supabase");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const DEFAULT_MODEL = process.env.OPENAI_PROJECT_AI_MODEL || "gpt-4o-mini";

/**
 * 1. Action: Create Project
 */
async function createProjectAction({
  name,
  source_lang = "en",
  target_langs = ["hi"],
  file_ids = [],
  due_date = null,
  notes = "",
  userId,
  organizationId = null
}) {
  const sLang = source_lang || "en";
  const tLangs = Array.isArray(target_langs) ? target_langs : [target_langs || "hi"];
  const cleanName = (name || "Untitled Project").trim();

  const insertPayload = {
    name: cleanName,
    owner_id: userId,
    source_lang: sLang,
    target_languages: tLangs,
    description: notes || "",
    organization_id: organizationId
  };

  // Insert project
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .insert(insertPayload)
    .select()
    .single();

  if (projErr || !project) {
    throw new Error(`Failed to create project: ${projErr?.message || "Unknown error"}`);
  }

  const assignedDocs = [];
  const createdJobs = [];

  // Bind uploaded files/documents to this new project if file_ids are provided
  if (Array.isArray(file_ids) && file_ids.length > 0) {
    for (const fid of file_ids) {
      // Check if document already exists
      const { data: existingDoc } = await supabase
        .from("documents")
        .select("*")
        .eq("id", fid)
        .single();

      if (existingDoc) {
        // Link existing document to project
        await supabase
          .from("documents")
          .update({
            project_id: project.id,
            source_lang: sLang,
            target_lang: tLangs[0] || "hi",
            organization_id: organizationId
          })
          .eq("id", fid);

        assignedDocs.push(existingDoc);

        // Create job records for target languages
        const jobsToInsert = tLangs.map((lang) => ({
          project_id: project.id,
          document_id: fid,
          target_lang: lang,
          status: "in_progress",
          organization_id: organizationId
        }));

        const { data: jobs } = await supabase.from("jobs").insert(jobsToInsert).select();
        if (jobs) createdJobs.push(...jobs);
      }
    }
  }

  return {
    success: true,
    action: "create_project",
    project,
    assignedDocumentsCount: assignedDocs.length,
    jobsCreatedCount: createdJobs.length,
    message: `Project '${project.name}' successfully created with source '${sLang}' and target language(s) '${tLangs.join(", ")}'.`
  };
}

/**
 * 2. Action: Duplicate Project with Scope Selection
 * Scope Options:
 *  - 'source_only': Settings + Source Files Only (Fresh translation state)
 *  - 'full_with_translations': Settings + Source Files + Existing Target Translations (Full snapshot clone)
 */
async function duplicateProjectAction({
  projectId,
  scope = "source_only",
  newName = null,
  addTargetLangs = [],
  userId,
  organizationId = null
}) {
  if (!projectId) {
    throw new Error("Target projectId is required for duplication.");
  }

  // 1. Fetch original project
  const { data: origProject, error: fetchErr } = await supabase
    .from("projects")
    .select("*, documents(*)")
    .eq("id", projectId)
    .single();

  if (fetchErr || !origProject) {
    throw new Error(`Original project with ID ${projectId} not found.`);
  }

  // Combine target languages
  const rawLangs = origProject.target_languages || origProject.target_lang;
  const origTargetLangs = Array.isArray(rawLangs)
    ? rawLangs
    : [rawLangs || "hi"];

  const combinedTargetLangs = Array.from(
    new Set([...origTargetLangs, ...(Array.isArray(addTargetLangs) ? addTargetLangs : [])])
  );

  const duplicateName = newName || `${origProject.name} (Copy)`;

  const dupPayload = {
    name: duplicateName,
    owner_id: userId || origProject.owner_id,
    source_lang: origProject.source_lang,
    target_languages: combinedTargetLangs,
    description: origProject.description ? `Cloned from project ${origProject.id}. ${origProject.description}` : `Cloned from project ${origProject.id}`,
    organization_id: organizationId || origProject.organization_id
  };

  // 2. Create duplicated project
  const { data: duplicatedProject, error: createErr } = await supabase
    .from("projects")
    .insert(dupPayload)
    .select()
    .single();

  if (createErr || !duplicatedProject) {
    throw new Error(`Failed to create duplicated project: ${createErr?.message || "Unknown error"}`);
  }

  // 3. Fetch documents of original project
  const { data: origDocs } = await supabase
    .from("documents")
    .select("*")
    .eq("project_id", projectId);

  const clonedDocs = [];
  const clonedJobs = [];

  if (origDocs && origDocs.length > 0) {
    for (const doc of origDocs) {
      const newDocId = uuidv4();

      // Duplicate document entry
      const { data: newDoc } = await supabase
        .from("documents")
        .insert({
          id: newDocId,
          name: doc.name,
          owner_id: userId || doc.owner_id,
          file_id: newDocId,
          project_id: duplicatedProject.id,
          source_lang: doc.source_lang,
          target_lang: combinedTargetLangs[0] || doc.target_lang,
          organization_id: organizationId || doc.organization_id
        })
        .select()
        .single();

      if (newDoc) {
        clonedDocs.push(newDoc);

        // Copy template html_files row if exists
        const { data: origHtml } = await supabase
          .from("html_files")
          .select("content")
          .eq("id", doc.id || doc.file_id)
          .single();

        if (origHtml) {
          await supabase.from("html_files").insert({
            id: newDocId,
            content: origHtml.content
          });
        }

        // Fetch original segments
        const origSegments = await fetchAllSegments(doc.id);

        if (origSegments && origSegments.length > 0) {
          let segmentsToInsert = [];

          if (scope === "source_only") {
            // Filter to only source segments (target_lang is null or source template)
            const sourceSegs = origSegments.filter((s) => !s.target_lang || s.target_lang === "source");
            segmentsToInsert = sourceSegs.map((s, idx) => ({
              document_id: newDocId,
              segment_index: idx + 1,
              target_lang: null,
              source_text: s.source_text || "",
              target_text: "",
              status: "draft"
            }));
          } else {
            // full_with_translations: Copy all segment entries
            segmentsToInsert = origSegments.map((s) => ({
              document_id: newDocId,
              segment_index: s.segment_index,
              target_lang: s.target_lang,
              source_text: s.source_text || "",
              target_text: s.target_text || "",
              status: s.status || "draft",
              mqm_accuracy_score: s.mqm_accuracy_score,
              mqm_report: s.mqm_report
            }));
          }

          // Insert segments in batches
          const BATCH_SIZE = 500;
          for (let i = 0; i < segmentsToInsert.length; i += BATCH_SIZE) {
            await supabase.from("document_segments").insert(segmentsToInsert.slice(i, i + BATCH_SIZE));
          }
        }

        // Create jobs for all combined target languages
        const jobsToInsert = combinedTargetLangs.map((lang) => ({
          project_id: duplicatedProject.id,
          document_id: newDocId,
          target_lang: lang,
          status: "in_progress",
          organization_id: organizationId || doc.organization_id
        }));

        const { data: newJobs } = await supabase.from("jobs").insert(jobsToInsert).select();
        if (newJobs) clonedJobs.push(...newJobs);
      }
    }
  }

  return {
    success: true,
    action: "duplicate_project",
    scope,
    duplicatedProject,
    documentsClonedCount: clonedDocs.length,
    jobsCreatedCount: clonedJobs.length,
    message: `Project '${origProject.name}' successfully duplicated to '${duplicatedProject.name}' using scope '${scope === "source_only" ? "Settings + Source Files Only" : "Full Snapshot with Translations"}'.`
  };
}

/**
 * 3. Action: Add Target Languages to Project
 */
async function addTargetLanguagesAction({ projectId, targetLangs = [], userId, organizationId = null }) {
  if (!projectId) {
    throw new Error("Project ID is required to add target languages.");
  }

  const { data: project, error: fetchErr } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (fetchErr || !project) {
    throw new Error(`Project ${projectId} not found.`);
  }

  const rawLangs = project.target_languages || project.target_lang;
  const existingLangs = Array.isArray(rawLangs) ? rawLangs : [rawLangs || "hi"];
  const newLangs = Array.isArray(targetLangs) ? targetLangs : [targetLangs];

  const updatedTargetLangs = Array.from(new Set([...existingLangs, ...newLangs]));

  // Update project target_languages
  const { data: updatedProject, error: updateErr } = await supabase
    .from("projects")
    .update({ target_languages: updatedTargetLangs })
    .eq("id", projectId)
    .select()
    .single();

  if (updateErr) {
    throw new Error(`Failed to update project target languages: ${updateErr.message}`);
  }

  // Fetch documents for this project
  const { data: docs } = await supabase.from("documents").select("id").eq("project_id", projectId);

  const createdJobs = [];
  if (docs && docs.length > 0) {
    for (const doc of docs) {
      for (const lang of newLangs) {
        // Check if job already exists
        const { data: existingJob } = await supabase
          .from("jobs")
          .select("id")
          .eq("document_id", doc.id)
          .eq("target_lang", lang)
          .single();

        if (!existingJob) {
          const { data: job } = await supabase
            .from("jobs")
            .insert({
              project_id: projectId,
              document_id: doc.id,
              target_lang: lang,
              status: "in_progress",
              organization_id: organizationId || project.organization_id
            })
            .select()
            .single();

          if (job) createdJobs.push(job);
        }
      }
    }
  }

  return {
    success: true,
    action: "add_target_languages",
    project: updatedProject,
    addedLanguages: newLangs,
    newJobsCreatedCount: createdJobs.length,
    message: `Added target language(s) '${newLangs.join(", ")}' to project '${project.name}'.`
  };
}

/**
 * 4. Action: Set Project Context & Notes
 */
async function setProjectContextAction({ projectId, contextNotes, userId }) {
  if (!projectId) {
    throw new Error("Project ID is required to set project context.");
  }

  const { data: updatedProject, error } = await supabase
    .from("projects")
    .update({ description: contextNotes })
    .eq("id", projectId)
    .select()
    .single();

  if (error || !updatedProject) {
    throw new Error(`Failed to update project context: ${error?.message || "Project not found"}`);
  }

  return {
    success: true,
    action: "set_project_context",
    project: updatedProject,
    message: `Project context and guidelines successfully updated for project '${updatedProject.name}'.`
  };
}

/**
 * OpenAI Tool Definitions Schema
 */
const PROJECT_TOOLS = [
  {
    type: "function",
    function: {
      name: "create_project",
      description: "Create a single localization project (or multiple projects if explicitly specified) from uploaded file IDs or instructions.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name of the project." },
          source_lang: { type: "string", description: "Source language code e.g. en, es, fr." },
          target_langs: {
            type: "array",
            items: { type: "string" },
            description: "List of target language codes e.g. ['hi', 'es', 'de']."
          },
          file_ids: {
            type: "array",
            items: { type: "string" },
            description: "Array of uploaded document IDs to associate with this project."
          },
          due_date: { type: "string", description: "Optional due date ISO string or text e.g. 2026-09-01." },
          notes: { type: "string", description: "Project domain context notes, style guidelines, or translator instructions." }
        },
        required: ["name", "target_langs"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "duplicate_project",
      description: "Duplicate an existing project. Allows choosing scope: source_only (Settings + Source Files) or full_with_translations (Settings + Source Files + Existing Target Translations).",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "UUID or numeric ID of the source project to duplicate." },
          scope: {
            type: "string",
            enum: ["source_only", "full_with_translations"],
            description: "Scope of duplication. Use source_only for clean translation state, or full_with_translations for complete snapshot clone."
          },
          new_name: { type: "string", description: "Optional new name for the duplicated project." },
          add_target_langs: {
            type: "array",
            items: { type: "string" },
            description: "Optional additional target languages to add during duplication."
          }
        },
        required: ["project_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "add_target_languages",
      description: "Add new target language(s) to an existing project.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "ID of the target project." },
          target_langs: {
            type: "array",
            items: { type: "string" },
            description: "List of target language codes to add."
          }
        },
        required: ["project_id", "target_langs"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "set_project_context",
      description: "Set or update the domain context, guidelines, or reference notes for a project.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "ID of the project." },
          context_notes: { type: "string", description: "Project guidelines or domain context text." }
        },
        required: ["project_id", "context_notes"]
      }
    }
  }
];

/**
 * Master AI Command Processor
 */
async function processAICommand({ prompt, fileIds = [], projectId = null, userId, organizationId = null }) {
  if (!prompt || typeof prompt !== "string") {
    throw new Error("Prompt is required for AI Command execution.");
  }

  // 1. Check if user is asking to duplicate without specifying scope
  const isDuplicationRequest = /duplicate|clone|copy project/i.test(prompt);
  const mentionsScope = /source|settings only|fresh|full|with translation|all translation/i.test(prompt);

  if (isDuplicationRequest && !mentionsScope && (projectId || /project [0-9a-f-]+/i.test(prompt))) {
    // Return interactive clarification signal for UI modal
    let detectedProjectId = projectId;
    const matchId = prompt.match(/project ([0-9a-f-]+)/i);
    if (matchId) detectedProjectId = matchId[1];

    return {
      success: true,
      requiresClarification: true,
      clarificationType: "duplication_scope",
      projectId: detectedProjectId,
      message: "Please select the scope for duplicating this project:",
      options: [
        { label: "Settings + Source Files Only (Fresh State)", value: "source_only" },
        { label: "Settings + Source Files + Existing Translations (Full Clone)", value: "full_with_translations" }
      ]
    };
  }

  // 2. Call OpenAI API if API key is present
  if (OPENAI_API_KEY) {
    try {
      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: DEFAULT_MODEL,
          messages: [
            {
              role: "system",
              content: `You are an AI Project Management Assistant for a CAT translation platform.
Your task is to analyze user requests and call the appropriate tool to execute project operations.
By default, if multiple files are provided, combine them into a SINGLE project unless the user explicitly requests separate projects.
Active Context: User ID: ${userId}, Target Project ID (if any): ${projectId || "None"}, Uploaded File IDs: ${JSON.stringify(fileIds)}.`
            },
            {
              role: "user",
              content: prompt
            }
          ],
          tools: PROJECT_TOOLS,
          tool_choice: "auto",
          temperature: 0.2
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          timeout: 20000
        }
      );

      const message = response.data?.choices?.[0]?.message;

      if (message?.tool_calls && message.tool_calls.length > 0) {
        const results = [];

        for (const toolCall of message.tool_calls) {
          const fnName = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments || "{}");

          if (fnName === "create_project") {
            const res = await createProjectAction({
              ...args,
              file_ids: args.file_ids || fileIds,
              userId,
              organizationId
            });
            results.push(res);
          } else if (fnName === "duplicate_project") {
            const res = await duplicateProjectAction({
              projectId: args.project_id || projectId,
              scope: args.scope || "source_only",
              newName: args.new_name,
              addTargetLangs: args.add_target_langs,
              userId,
              organizationId
            });
            results.push(res);
          } else if (fnName === "add_target_languages") {
            const res = await addTargetLanguagesAction({
              projectId: args.project_id || projectId,
              targetLangs: args.target_langs,
              userId,
              organizationId
            });
            results.push(res);
          } else if (fnName === "set_project_context") {
            const res = await setProjectContextAction({
              projectId: args.project_id || projectId,
              contextNotes: args.context_notes,
              userId
            });
            results.push(res);
          }
        }

        return {
          success: true,
          executedTools: message.tool_calls.map((t) => t.function.name),
          results,
          message: results.map((r) => r.message).join(" ")
        };
      }

      // If text response without tool call
      return {
        success: true,
        aiResponse: message?.content,
        message: message?.content || "Command processed."
      };
    } catch (aiErr) {
      console.warn("OpenAI API call failed or timed out. Falling back to deterministic parser:", aiErr.message);
    }
  }

  // 3. Fallback Deterministic Parser (if no OpenAI key or API call fails)
  const lowerPrompt = prompt.toLowerCase();

  if (lowerPrompt.includes("duplicate") || lowerPrompt.includes("clone") || lowerPrompt.includes("copy project")) {
    const scope = lowerPrompt.includes("translation") || lowerPrompt.includes("full") ? "full_with_translations" : "source_only";
    const targetProjId = projectId || (prompt.match(/project ([0-9a-f-]+)/i) || [])[1];

    if (!targetProjId) {
      throw new Error("Could not determine which project to duplicate. Please specify project ID or select a project.");
    }

    const res = await duplicateProjectAction({
      projectId: targetProjId,
      scope,
      userId,
      organizationId
    });
    return res;
  }

  if (lowerPrompt.includes("add language") || lowerPrompt.includes("add target")) {
    const targetProjId = projectId || (prompt.match(/project ([0-9a-f-]+)/i) || [])[1];
    const langsMatch = prompt.match(/language[s]? ([a-z, ]+)/i) || prompt.match(/target[s]? ([a-z, ]+)/i);
    const langs = langsMatch ? langsMatch[1].split(/[, ]+/).filter(Boolean) : ["hi"];

    if (!targetProjId) {
      throw new Error("Could not determine which project to add target languages to.");
    }

    const res = await addTargetLanguagesAction({
      projectId: targetProjId,
      targetLangs: langs,
      userId,
      organizationId
    });
    return res;
  }

  // Default: Create project
  const nameMatch = prompt.match(/name[d]? ['"]?([^'"]+)['"]?/i) || prompt.match(/project ['"]?([^'"]+)['"]?/i);
  const projName = nameMatch ? nameMatch[1] : "AI Created Project";

  const targetLangsMatch = prompt.match(/target[s]? ([a-z, ]+)/i) || prompt.match(/for ([a-z, ]+)/i);
  const tLangs = targetLangsMatch ? targetLangsMatch[1].split(/[, ]+/).filter((l) => l.length >= 2 && l.length <= 5) : ["hi"];

  const res = await createProjectAction({
    name: projName,
    source_lang: "en",
    target_langs: tLangs.length > 0 ? tLangs : ["hi"],
    file_ids: fileIds,
    notes: prompt,
    userId,
    organizationId
  });

  return res;
}

module.exports = {
  processAICommand,
  createProjectAction,
  duplicateProjectAction,
  addTargetLanguagesAction,
  setProjectContextAction
};
