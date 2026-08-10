const express = require("express");
const { checkAuth } = require("../utils/authMiddleware");
const { aiRateLimiter } = require("../utils/rateLimiter");
const {
  processAICommand,
  duplicateProjectAction,
  addTargetLanguagesAction,
  setProjectContextAction
} = require("../services/aiProjectOrchestrator");

const aiProjectRouter = express.Router();

// Require authentication for all AI Project endpoints
aiProjectRouter.use(checkAuth);

// Linguist role check middleware
aiProjectRouter.use((req, res, next) => {
  if (req.profile?.role === "linguist") {
    return res.status(403).json({ error: "Access denied. Linguist accounts cannot execute AI project orchestration commands." });
  }
  next();
});

/**
 * 1. Process Natural Language AI Command for Projects
 * Request body: { prompt: string, fileIds?: string[], projectId?: string }
 */
aiProjectRouter.post(["/projects/ai-command", "/api/projects/ai-command"], aiRateLimiter, async (req, res) => {
  try {
    const { prompt, fileIds, projectId } = req.body;
    const userId = req.user.id;
    const organizationId = req.tenant?.id || req.profile?.organization_id || null;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt string is required." });
    }

    const result = await processAICommand({
      prompt,
      fileIds: fileIds || [],
      projectId: projectId || null,
      userId,
      organizationId
    });

    return res.json(result);
  } catch (error) {
    console.error("AI Project Command Error:", error);
    return res.status(500).json({ error: error.message || "Failed to execute AI project command." });
  }
});

/**
 * 2. Interactive / Programmatic Project Duplication Endpoint
 * Request body: { scope: "source_only" | "full_with_translations", newName?: string, addTargetLangs?: string[] }
 */
aiProjectRouter.post(["/projects/:id/duplicate", "/api/projects/:id/duplicate"], async (req, res) => {
  try {
    const projectId = req.params.id;
    const { scope, newName, addTargetLangs } = req.body;
    const userId = req.user.id;
    const organizationId = req.tenant?.id || req.profile?.organization_id || null;

    const result = await duplicateProjectAction({
      projectId,
      scope: scope || "source_only",
      newName,
      addTargetLangs: addTargetLangs || [],
      userId,
      organizationId
    });

    return res.json(result);
  } catch (error) {
    console.error("Project Duplication Error:", error);
    return res.status(500).json({ error: error.message || "Failed to duplicate project." });
  }
});

/**
 * 3. Dynamic Target Language Addition Endpoint
 * Request body: { targetLangs: string[] }
 */
aiProjectRouter.post(["/projects/:id/add-languages", "/api/projects/:id/add-languages"], async (req, res) => {
  try {
    const projectId = req.params.id;
    const { targetLangs } = req.body;
    const userId = req.user.id;
    const organizationId = req.tenant?.id || req.profile?.organization_id || null;

    if (!targetLangs || (Array.isArray(targetLangs) && targetLangs.length === 0)) {
      return res.status(400).json({ error: "targetLangs array is required." });
    }

    const result = await addTargetLanguagesAction({
      projectId,
      targetLangs,
      userId,
      organizationId
    });

    return res.json(result);
  } catch (error) {
    console.error("Add Target Languages Error:", error);
    return res.status(500).json({ error: error.message || "Failed to add target languages." });
  }
});

/**
 * 4. Set Project Context Notes Endpoint
 * Request body: { contextNotes: string }
 */
aiProjectRouter.post(["/projects/:id/context", "/api/projects/:id/context"], async (req, res) => {
  try {
    const projectId = req.params.id;
    const { contextNotes } = req.body;
    const userId = req.user.id;

    const result = await setProjectContextAction({
      projectId,
      contextNotes: contextNotes || "",
      userId
    });

    return res.json(result);
  } catch (error) {
    console.error("Set Project Context Error:", error);
    return res.status(500).json({ error: error.message || "Failed to set project context." });
  }
});

/**
 * 5. Delete Project Endpoint
 */
aiProjectRouter.post(["/projects/:id/ai-delete", "/api/projects/:id/ai-delete"], async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user.id;
    const organizationId = req.tenant?.id || req.profile?.organization_id || null;

    const { deleteProjectAction } = require("../services/aiProjectOrchestrator");
    const result = await deleteProjectAction({
      projectId,
      userId,
      organizationId
    });

    return res.json(result);
  } catch (error) {
    console.error("AI Delete Project Error:", error);
    return res.status(500).json({ error: error.message || "Failed to delete project." });
  }
});

module.exports = aiProjectRouter;
