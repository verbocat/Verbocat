/**
 * =========================================================================================
 * 🚨 CRITICAL AI SAFETY & ARCHITECTURE SECURITY WARNING 🚨
 * DO NOT EDIT OR REMOVE THE FOLLOWING CONSTRAINTS IN THIS FILE:
 *
 * 1. MANDATORY `source_text` IN UPSERTS:
 *    PostgreSQL table `document_segments` enforces `source_text TEXT NOT NULL`.
 *    EVERY `.upsert()` call in ALL endpoints (`translate-batch`, PUT single segment, POST bulk)
 *    MUST include `source_text`. Omitting `source_text` causes PostgreSQL Error 23502
 *    (null value violates not-null constraint) and breaks segment saving 100% of the time.
 *
 * 2. MULTI-TENANCY TARGET LANGUAGE PARTITIONING:
 *    Template rows have `target_lang IS NULL`. Target translations for languages (e.g. `ar`, `hi`)
 *    MUST insert/update distinct rows with `target_lang = '<lang_code>'`. NEVER touch template rows.
 *
 * 3. 1-BASED SEGMENT INDEXING:
 *    `segment_index` is 1-indexed. NEVER subtract 1 when writing or querying `segment_index`.
 * =========================================================================================
 */

const express = require("express");
const { supabase, fetchAllSegments } = require("../config/supabase");
const { checkAuth, checkTranslateAccess, checkDocumentAccess } = require("../utils/authMiddleware");
const { translateSegments } = require("../services/translationService");
const { translateSrtSegments } = require("../srtEngine/srtTranslationService");
const { getDocumentRoomId } = require("../services/socket");
const { calculateProgress } = require("../utils/segmentProgress");

const segmentRouter = express.Router();

// 1. Batch AI Translate (Requires write access to document)
segmentRouter.post(["/translate-batch", "/api/translate-batch"], checkAuth, checkTranslateAccess, checkDocumentAccess({ requiredPermission: "write" }), async (request, response) => {
  try {
    const { segments, target, source, contextSettings, fileName, documentId } = request.body;
    let fileExtension = "";
    if (documentId) {
      const { data: doc } = await supabase.from("documents").select("file_extension").eq("id", documentId).single();
      if (doc) {
        fileExtension = doc.file_extension || "";
      }
    }
    const updatedContextSettings = { ...contextSettings, fileExtension };
    const organizationId = request.tenant?.id || request.profile?.organization_id || null;

    let results = [];
    let wordCount = 0;

    const normExt = String(fileExtension || "").toLowerCase();
    const normCtxExt = String(contextSettings?.fileExtension || "").toLowerCase();
    const normName = String(fileName || "").toLowerCase();
    const isSrt = normExt.includes("srt") || normCtxExt.includes("srt") || normName.endsWith(".srt");

    if (isSrt) {
      console.log(`[ROUTE_ROUTING] Routing SRT translation request to dedicated srtEngine (ext="${fileExtension}", name="${fileName}")...`);
      const srtRes = await translateSrtSegments(segments, target, source, updatedContextSettings, request.user.id, organizationId);
      results = srtRes.results;
      wordCount = srtRes.wordCount;
    } else {
      const docRes = await translateSegments(segments, target, source, updatedContextSettings, request.user.id, organizationId);
      results = docRes.results;
      wordCount = docRes.wordCount;
    }
    
    if (documentId && results && results.length > 0) {
      const { getIo } = require("../services/socket");
      const io = getIo();

      // Pre-fetch template source_text map for all segments in document
      const { data: templateSegs } = await supabase
        .from("document_segments")
        .select("segment_index, source_text")
        .eq("document_id", documentId)
        .is("target_lang", null);

      const templateSourceMap = new Map();
      if (templateSegs) {
        templateSegs.forEach(t => templateSourceMap.set(t.segment_index, t.source_text || ""));
      }

      const updatePromises = results.map(async (item) => {
        const segmentIndex = item.segment_index !== undefined ? Number(item.segment_index) : (item.id !== undefined ? Number(item.id) : 1);
        const sourceText = item.source || templateSourceMap.get(segmentIndex) || "";

        const { isLegitimatelyIdentical } = require("../services/translationProviders");
        const cleanSource = String(item.source || "").replace(/<[^>]+>/g, "").trim();
        const cleanTranslated = String(item.translated || "").replace(/<[^>]+>/g, "").trim();

        const isFallback = target !== source &&
          item.translated &&
          item.source &&
          cleanTranslated.toLowerCase() === cleanSource.toLowerCase() &&
          /\p{L}/u.test(cleanSource) &&
          !isLegitimatelyIdentical(cleanSource);

        const updateFields = {
          target_text: isFallback ? "" : item.translated,
          status: isFallback ? "draft" : "translated",
          updated_at: new Date().toISOString()
        };

        if (!isFallback) {
          updateFields.mqm_accuracy_score = item.mqmAccuracyScore !== undefined ? item.mqmAccuracyScore : 100;
          updateFields.mqm_report = item.mqmReport || null;
        }

        // 1. Try updating existing row matching target_lang = target
        let { data, error: updateErr } = await supabase
          .from("document_segments")
          .update(updateFields)
          .eq("document_id", documentId)
          .eq("segment_index", segmentIndex)
          .eq("target_lang", target)
          .select()
          .maybeSingle();

        if (updateErr) {
          console.error(`[TRANSLATE_BATCH_UPDATE_ERR] seg=${segmentIndex} lang=${target}:`, updateErr.message);
        }

        // 2. If no row matched target_lang, upsert target segment row (including required source_text)
        if (!data) {
          const { data: inserted, error: insErr } = await supabase
            .from("document_segments")
            .upsert(
              {
                document_id: documentId,
                segment_index: segmentIndex,
                target_lang: target,
                source_text: sourceText,
                target_text: updateFields.target_text || "",
                status: updateFields.status || "draft",
                mqm_accuracy_score: updateFields.mqm_accuracy_score || 100,
                mqm_report: updateFields.mqm_report || null,
                updated_at: updateFields.updated_at
              },
              { onConflict: "document_id,segment_index,target_lang" }
            )
            .select()
            .single();

          if (insErr) {
            console.error(`[TRANSLATE_BATCH_UPSERT_ERR] seg=${segmentIndex} lang=${target}:`, insErr.message);
          } else {
            data = inserted;
          }
        }

        if (data && io) {
          io.to(getDocumentRoomId(documentId, target)).emit("segment-updated", {
            segmentIndex,
            targetText: updateFields.target_text,
            status: updateFields.status,
            mqmAccuracyScore: updateFields.mqm_accuracy_score,
            mqmReport: updateFields.mqm_report,
            updatedBy: request.user.email,
            targetLang: target
          });
        }
      });

      await Promise.all(updatePromises);

      try {
        const segmentsInDb = await fetchAllSegments(documentId, "source_text, status, target_text", target);
        const progress = calculateProgress(segmentsInDb).progress;
        const newStatus = progress === 100 ? "completed" : "running";

        const { data: job } = await supabase
          .from("translation_jobs")
          .select("id")
          .eq("document_id", documentId)
          .eq("target_lang", target)
          .single();

        if (job) {
          await supabase
            .from("translation_jobs")
            .update({ progress, status: newStatus })
            .eq("id", job.id);

          const { broadcastJobStatus } = require("../services/jobQueue");
          broadcastJobStatus(job.id, documentId, newStatus, progress);
        }
      } catch (jobUpdateErr) {
        console.error("Failed to update job stats in translate-batch:", jobUpdateErr);
      }
    }

    if (wordCount > 0) {
      const email = request.profile.email;
      const userId = request.profile.id;
      const isSeo = contextSettings?.purpose === "SEO";
      const actionName = isSeo ? "translate-batch (SEO)" : "translate-batch";

      const logOrgId = request.tenant?.id || request.profile.organization_id || null;
      await supabase.from("credit_logs").insert({
        user_id: userId,
        email: email,
        action: actionName,
        word_count: wordCount,
        file_name: fileName || "document",
        organization_id: logOrgId
      });

      const newConsumed = request.profile.credits_consumed + wordCount;
      await supabase
        .from("profiles")
        .update({ credits_consumed: newConsumed })
        .eq("id", userId);
    }

    response.json({ results });
  } catch (error) {
    console.error("Batch Translate Error:", error);
    response.status(500).json({ error: error.message || "Failed batch translation" });
  }
});

// 2. Fetch Document Segments (Supports both /documents/:id/segments and /documents/:id/lang/:lang/segments)
segmentRouter.get([
  "/documents/:id/segments", 
  "/api/documents/:id/segments",
  "/documents/:id/lang/:lang/segments",
  "/api/documents/:id/lang/:lang/segments"
], checkAuth, checkDocumentAccess({ requiredPermission: "read" }), async (request, response) => {
  try {
    const { id, lang } = request.params;
    const targetLang = lang || request.query.target || "hi";

    const segments = await fetchAllSegments(id, "*", targetLang);
    response.json({ segments });
  } catch (error) {
    console.error("Fetch Segments Error:", error);
    response.status(500).json({ error: "Failed to fetch document segments" });
  }
});

// 3. Update Single Segment (Supports both /documents/:id/segments/:index and /documents/:id/lang/:lang/segments/:index)
segmentRouter.put([
  "/documents/:id/segments/:index", 
  "/api/documents/:id/segments/:index",
  "/documents/:id/lang/:lang/segments/:index",
  "/api/documents/:id/lang/:lang/segments/:index"
], checkAuth, checkDocumentAccess({ requiredPermission: "write" }), async (request, response) => {
  try {
    const { id, index, lang } = request.params;
    const { targetText, status, mqmAccuracyScore, mqmReport, originalTargetText, trackedBy, targetLang: bodyLang } = request.body;
    const targetLang = lang || bodyLang || "hi";
    const segIndex = Number(index);

    const updateFields = {
      target_text: targetText !== undefined ? targetText : "",
      status: status || "draft",
      updated_at: new Date().toISOString()
    };

    if (mqmAccuracyScore !== undefined) updateFields.mqm_accuracy_score = mqmAccuracyScore;
    if (mqmReport !== undefined) updateFields.mqm_report = mqmReport;
    if (originalTargetText !== undefined) updateFields.original_target_text = originalTargetText;
    if (trackedBy !== undefined) updateFields.tracked_by = trackedBy;

    // 1. Try updating existing row matching target_lang = targetLang
    let { data } = await supabase
      .from("document_segments")
      .update(updateFields)
      .eq("document_id", id)
      .eq("segment_index", segIndex)
      .eq("target_lang", targetLang)
      .select()
      .maybeSingle();

    // 2. If no row matched target_lang, upsert new target segment row without modifying template (target_lang: null) rows
    if (!data) {
      let sourceText = request.body.sourceText || request.body.source || "";
      if (!sourceText) {
        const { data: tmpl } = await supabase
          .from("document_segments")
          .select("source_text")
          .eq("document_id", id)
          .eq("segment_index", segIndex)
          .is("target_lang", null)
          .maybeSingle();
        if (tmpl) sourceText = tmpl.source_text || "";
      }

      const { data: inserted, error: insErr } = await supabase
        .from("document_segments")
        .upsert(
          {
            document_id: id,
            segment_index: segIndex,
            target_lang: targetLang,
            source_text: sourceText,
            target_text: updateFields.target_text || "",
            status: updateFields.status || "draft",
            mqm_accuracy_score: updateFields.mqm_accuracy_score || 100,
            mqm_report: updateFields.mqm_report || null,
            original_target_text: updateFields.original_target_text || null,
            tracked_by: updateFields.tracked_by || null,
            updated_at: updateFields.updated_at
          },
          { onConflict: "document_id,segment_index,target_lang" }
        )
        .select()
        .single();

      if (insErr) {
        console.error("Segment Upsert Error:", insErr);
        throw insErr;
      }
      data = inserted;
    }

    // Broadcast socket event
    const { getIo } = require("../services/socket");
    const io = getIo();
    if (io) {
      io.to(getDocumentRoomId(id, targetLang)).emit("segment-updated", {
        segmentIndex: segIndex,
        targetText: updateFields.target_text,
        status: updateFields.status,
        mqmAccuracyScore: updateFields.mqm_accuracy_score,
        mqmReport: updateFields.mqm_report,
        updatedBy: request.user.email,
        targetLang
      });
    }

    response.json({ segment: data });
  } catch (error) {
    console.error("Update Segment Error:", error);
    response.status(500).json({ error: "Failed to update segment" });
  }
});

// 4. Bulk Update Segments (Supports both base and language-path variants)
segmentRouter.post([
  "/documents/:id/segments/bulk",
  "/api/documents/:id/segments/bulk",
  "/documents/:id/lang/:lang/segments/bulk",
  "/api/documents/:id/lang/:lang/segments/bulk"
], checkAuth, checkDocumentAccess({ requiredPermission: "write" }), async (request, response) => {
  try {
    const { id, lang } = request.params;
    const { updates, autoPropagate, targetLang: bodyLang } = request.body;
    const targetLang = lang || bodyLang || "hi";

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return response.status(400).json({ error: "No segment updates provided" });
    }

    const { getIo } = require("../services/socket");
    const io = getIo();
    const results = [];

    // Pre-fetch template source_text map for document
    const { data: templateSegs } = await supabase
      .from("document_segments")
      .select("segment_index, source_text")
      .eq("document_id", id)
      .is("target_lang", null);

    const templateSourceMap = new Map();
    if (templateSegs) {
      templateSegs.forEach(t => templateSourceMap.set(t.segment_index, t.source_text || ""));
    }

    console.log(`\n========================================`);
    console.log(`[SEGMENT_BULK_SAVE_REQUEST] DocId: ${id} | TargetLang: ${targetLang} | Count: ${updates.length}`);

    for (const item of updates) {
      const { segmentIndex, targetText, status, originalTargetText, trackedBy } = item;
      const segIndex = Number(segmentIndex);

      if (isNaN(segIndex)) {
        console.warn(`[SEGMENT_SAVE_WARN] Skipping invalid segmentIndex:`, item);
        continue;
      }

      const updateFields = {
        target_text: targetText !== undefined ? targetText : "",
        status: status || "draft",
        updated_at: new Date().toISOString()
      };

      if (originalTargetText !== undefined) updateFields.original_target_text = originalTargetText;
      if (trackedBy !== undefined) updateFields.tracked_by = trackedBy;

      // 1. Try updating existing row matching target_lang = targetLang
      let { data, error: err1 } = await supabase
        .from("document_segments")
        .update(updateFields)
        .eq("document_id", id)
        .eq("segment_index", segIndex)
        .eq("target_lang", targetLang)
        .select()
        .maybeSingle();

      if (err1) {
        console.error(`[SEGMENT_SAVE_ERR1] doc=${id} seg=${segIndex} lang=${targetLang}:`, err1.message);
      }

      // 2. If no row matched target_lang, upsert target segment row (including required source_text)
      if (!data) {
        const sourceText = item.source || item.sourceText || templateSourceMap.get(segIndex) || "";
        const { data: inserted, error: insErr } = await supabase
          .from("document_segments")
          .upsert({
            document_id: id,
            segment_index: segIndex,
            target_lang: targetLang,
            source_text: sourceText,
            target_text: updateFields.target_text || "",
            status: updateFields.status || "draft",
            original_target_text: updateFields.original_target_text || null,
            tracked_by: updateFields.tracked_by || null,
            updated_at: updateFields.updated_at
          }, { onConflict: "document_id,segment_index,target_lang" })
          .select()
          .single();

        if (insErr) {
          console.error(`[SEGMENT_SAVE_UPSERT_ERR] doc=${id} seg=${segIndex} lang=${targetLang}:`, insErr.message);
          continue;
        }
        data = inserted;
      }

      if (data) {
        console.log(`[SEGMENT_SAVE_SUCCESS] Seg #${segIndex} (${targetLang}) -> target_text: "${updateFields.target_text.substring(0, 40)}"`);
        results.push(data);
      }

      // Broadcast socket event for real-time sync across all users
      if (io) {
        io.to(getDocumentRoomId(id, targetLang)).emit("segment-updated", {
          segmentIndex: segIndex,
          targetText: updateFields.target_text,
          status: updateFields.status,
          originalTargetText: updateFields.original_target_text,
          trackedBy: updateFields.tracked_by,
          updatedBy: request.user.email,
          targetLang
        });
      }
    }

    console.log(`[SEGMENT_BULK_SAVE_COMPLETE] Saved ${results.length}/${updates.length} segments.`);
    console.log(`========================================\n`);

    // Update translation job progress after all segments are saved
    try {
      const segmentsInDb = await fetchAllSegments(id, "source_text, status, target_text", targetLang);
      const progress = calculateProgress(segmentsInDb).progress;
      const newStatus = progress === 100 ? "completed" : "running";

      const { data: job } = await supabase
        .from("translation_jobs")
        .select("id")
        .eq("document_id", id)
        .eq("target_lang", targetLang)
        .maybeSingle();

      if (job) {
        await supabase
          .from("translation_jobs")
          .update({ progress, status: newStatus })
          .eq("id", job.id);

        const { broadcastJobStatus } = require("../services/jobQueue");
        broadcastJobStatus(job.id, id, newStatus, progress);
      }
    } catch (jobErr) {
      console.error("Failed to update job stats in bulk save:", jobErr);
    }

    response.json({ success: true, saved: results.length });
  } catch (error) {
    console.error("Bulk Update Segments Error:", error);
    response.status(500).json({ error: "Failed to bulk update segments" });
  }
});

module.exports = {
  segmentRouter
};
