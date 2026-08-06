const express = require("express");
const { supabase } = require("../config/supabase");
const { checkAuth } = require("../utils/authMiddleware");

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

module.exports = {
  tmRouter
};
