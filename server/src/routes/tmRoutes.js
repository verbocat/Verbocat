const express = require("express");
const { supabase } = require("../config/supabase");
const { checkAuth } = require("../utils/authMiddleware");
const { runProjectTmAnalysis, runDocumentTmAnalysis } = require("../services/tmAnalysisService");

const tmRouter = express.Router();

// 1. Search TM
tmRouter.post("/tm/search", checkAuth, async (request, response) => {
  try {
    const { sourceText, sourceLang, targetLang } = request.body;
    const activeTenantId = request.tenant?.id || request.profile?.organization_id;
    const isSuperAdmin = request.profile?.role === "super_admin";

    if (!sourceText) {
      return response.json({ matches: [] });
    }

    let query = supabase
      .from("translation_memory")
      .select("*")
      .eq("source_text", sourceText);

    if (sourceLang) query = query.eq("source_lang", sourceLang);
    if (targetLang) query = query.eq("target_lang", targetLang);
    if (!isSuperAdmin && activeTenantId) {
      query = query.eq("organization_id", activeTenantId);
    }

    const { data: matches } = await query;
    response.json({ matches: matches || [] });
  } catch (error) {
    console.error("TM Search Error:", error);
    response.json({ matches: [] });
  }
});

// 2. Project-Level TM & Cross-File Volume Analysis (Exclusive & Inclusive Analysis)
tmRouter.get(["/projects/:projectId/tm-analysis", "/api/projects/:projectId/tm-analysis"], checkAuth, async (request, response) => {
  try {
    const { projectId } = request.params;
    const { lang, targetLang, mode = "exclusive", crossFile = "true" } = request.query;
    const activeTenantId = request.tenant?.id || request.profile?.organization_id;
    const isSuperAdmin = request.profile?.role === "super_admin";

    const result = await runProjectTmAnalysis({
      projectId,
      targetLang: lang || targetLang,
      mode,
      crossFile: crossFile === "true" || crossFile === true,
      activeTenantId,
      isSuperAdmin
    });

    response.json(result);
  } catch (error) {
    console.error("Project TM Analysis Error:", error);
    response.status(500).json({ error: error.message || "Failed to run project TM analysis" });
  }
});

// 3. Document-Level TM Analysis
tmRouter.get(
  [
    "/documents/:documentId/lang/:lang/tm-analysis",
    "/api/documents/:documentId/lang/:lang/tm-analysis",
    "/documents/:documentId/tm-analysis",
    "/api/documents/:documentId/tm-analysis"
  ],
  checkAuth,
  async (request, response) => {
    try {
      const { documentId, lang } = request.params;
      const targetLang = lang || request.query.targetLang || request.query.lang;
      const activeTenantId = request.tenant?.id || request.profile?.organization_id;
      const isSuperAdmin = request.profile?.role === "super_admin";

      const result = await runDocumentTmAnalysis({
        documentId,
        targetLang,
        activeTenantId,
        isSuperAdmin
      });

      response.json(result);
    } catch (error) {
      console.error("Document TM Analysis Error:", error);
      response.status(500).json({ error: error.message || "Failed to run document TM analysis" });
    }
  }
);

module.exports = {
  tmRouter
};

