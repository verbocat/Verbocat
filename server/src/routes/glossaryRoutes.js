const express = require("express");
const { supabase } = require("../config/supabase");
const { checkAuth } = require("../utils/authMiddleware");

const glossaryRouter = express.Router();

// 1. Fetch Glossary Terms
glossaryRouter.get("/glossary", checkAuth, async (request, response) => {
  try {
    const { sourceLang, targetLang } = request.query;
    const activeTenantId = request.tenant?.id || request.profile?.organization_id;
    const isSuperAdmin = request.profile?.role === "super_admin";

    let query = supabase.from("glossary").select("*").order("term", { ascending: true });
    if (sourceLang) query = query.eq("source_lang", sourceLang);
    if (targetLang) query = query.eq("target_lang", targetLang);
    if (!isSuperAdmin && activeTenantId) {
      query = query.eq("organization_id", activeTenantId);
    }

    const { data: terms, error } = await query;
    if (error) {
      // Fallback if glossary table doesn't exist yet
      return response.json({ terms: [] });
    }

    response.json({ terms: terms || [] });
  } catch (error) {
    console.error("Fetch Glossary Error:", error);
    response.json({ terms: [] });
  }
});

// 2. Add Glossary Term
glossaryRouter.post("/glossary", checkAuth, async (request, response) => {
  try {
    const { term, translation, sourceLang, targetLang, note } = request.body;
    const activeTenantId = request.tenant?.id || request.profile?.organization_id || null;

    if (!term || !translation) {
      return response.status(400).json({ error: "Term and translation are required" });
    }

    const { data, error } = await supabase
      .from("glossary")
      .insert({
        term: term.trim(),
        translation: translation.trim(),
        source_lang: sourceLang || "en",
        target_lang: targetLang || "hi",
        note: note || "",
        organization_id: activeTenantId
      })
      .select()
      .single();

    if (error) throw error;

    response.json({ term: data });
  } catch (error) {
    console.error("Add Glossary Term Error:", error);
    response.status(500).json({ error: "Failed to add glossary term" });
  }
});

// 3. Delete Glossary Term
glossaryRouter.delete("/glossary/:id", checkAuth, async (request, response) => {
  try {
    const { id } = request.params;
    const activeTenantId = request.tenant?.id || request.profile?.organization_id;
    const isSuperAdmin = request.profile?.role === "super_admin";

    let query = supabase.from("glossary").delete().eq("id", id);
    if (!isSuperAdmin && activeTenantId) {
      query = query.eq("organization_id", activeTenantId);
    }

    const { error } = await query;
    if (error) throw error;

    response.json({ message: "Glossary term deleted successfully" });
  } catch (error) {
    console.error("Delete Glossary Term Error:", error);
    response.status(500).json({ error: "Failed to delete glossary term" });
  }
});

module.exports = {
  glossaryRouter
};
