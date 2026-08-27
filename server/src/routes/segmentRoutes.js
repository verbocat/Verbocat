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

const syncToTranslationMemory = async (sourceText, targetText, sourceLang, targetLang) => {
  if (!sourceText || !targetText || !targetLang) return;
  const cleanSrc = String(sourceText).replace(/<[^>]+>/g, "").trim();
  const cleanTgt = String(targetText).replace(/<[^>]+>/g, "").trim();
  if (!cleanSrc || !cleanTgt) return;

  try {
    const sLang = sourceLang || "en";
    let query = supabase
      .from("translation_memory")
      .select("id")
      .eq("source_text", cleanSrc)
      .eq("source_lang", sLang)
      .eq("target_lang", targetLang);

    const { data: existing } = await query.limit(1);
    if (existing && existing.length > 0) {
      await supabase
        .from("translation_memory")
        .update({ target_text: cleanTgt, provider: "Linguist (ICE)" })
        .eq("id", existing[0].id);
    } else {
      await supabase
        .from("translation_memory")
        .insert({
          source_text: cleanSrc,
          target_text: cleanTgt,
          source_lang: sLang,
          target_lang: targetLang,
          provider: "Linguist (ICE)"
        });
    }
  } catch (err) {
    console.error("[TM_SYNC_WARN]", err.message);
  }
};

const segmentRouter = express.Router();

// 1. Batch AI Translate (Requires write access to document + owner/admin role for linguist block)
segmentRouter.post(["/translate-batch", "/api/translate-batch"], checkAuth, checkTranslateAccess, checkDocumentAccess({ requiredPermission: "write" }), async (request, response) => {
  try {
    const { segments, target, source, contextSettings, fileName, documentId } = request.body;

    // ── Server-side linguist guard: block linguists from running Auto-Translate ──
    // Only document owners, project owners, and privileged roles (admin/staff) may call this.
    {
      const role = request.profile?.role || "";
      const isPrivileged = ["super_admin", "admin", "verbolabs_staff", "vendor"].includes(role);
      if (!isPrivileged && documentId) {
        const { data: doc } = await supabase
          .from("documents")
          .select("owner_id, project_id")
          .eq("id", documentId)
          .maybeSingle();
        const isOwner = doc && doc.owner_id === request.user.id;
        let isProjectOwner = false;
        if (!isOwner && doc?.project_id) {
          const { data: proj } = await supabase
            .from("projects")
            .select("owner_id")
            .eq("id", doc.project_id)
            .maybeSingle();
          isProjectOwner = proj && proj.owner_id === request.user.id;
        }
        if (!isOwner && !isProjectOwner) {
          return response.status(403).json({
            error: "Access Denied: Linguists cannot run Auto-Translate. Only document owners and administrators can trigger batch AI translation."
          });
        }
      }
    }

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

        // NEVER blank out target text with empty string. Keep translated text intact.
        const translatedText = item.translated !== undefined && item.translated !== null ? item.translated : "";

        const updateFields = {
          target_text: translatedText,
          status: translatedText ? "translated" : "draft",
          mqm_accuracy_score: item.mqmAccuracyScore !== undefined ? item.mqmAccuracyScore : 100,
          mqm_report: item.mqmReport || null,
          updated_at: new Date().toISOString()
        };

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

    // ── AUDIT TRAIL FIX: Always log translate-batch activity ──
    // `wordCount` only counts segments sent to AI (not TM/cache hits). If all segments
    // were served from TM, wordCount = 0 and was previously silently skipped.
    // Now we ALWAYS log using request.wordCount (total words in the batch request)
    // so there is always an audit trail, even for pure TM-hit runs.
    {
      const email = request.profile.email;
      const userId = request.profile.id;
      const isSeo = contextSettings?.purpose === "SEO";
      const logOrgId = request.tenant?.id || request.profile.organization_id || null;
      // Total words requested (computed by checkTranslateAccess middleware)
      const totalRequestedWords = request.wordCount || 0;

      let actionName;
      if (wordCount === 0 && totalRequestedWords > 0) {
        // All segments served from TM — no AI credits used, but log for audit trail
        actionName = isSeo ? "translate-batch-tm (SEO)" : "translate-batch-tm";
      } else {
        actionName = isSeo ? "translate-batch (SEO)" : "translate-batch";
      }

      // Always insert an audit log row regardless of TM vs AI
      await supabase.from("credit_logs").insert({
        user_id: userId,
        email: email,
        action: actionName,
        word_count: totalRequestedWords,
        file_name: fileName || "document",
        organization_id: logOrgId
      }).catch(logErr => console.error("[CREDIT_LOG_WARN] Failed to insert credit_log:", logErr.message));

      // Only debit credits when AI translation was actually performed (not TM)
      if (wordCount > 0) {
        const newConsumed = (request.profile.credits_consumed || 0) + wordCount;
        await supabase
          .from("profiles")
          .update({ credits_consumed: newConsumed })
          .eq("id", userId);
      }
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

    // Sync to Translation Memory (TM) in background
    if (data && updateFields.target_text && updateFields.target_text.trim().length > 0) {
      const { data: docInfo } = await supabase.from("documents").select("source_lang").eq("id", id).maybeSingle();
      const sLang = docInfo?.source_lang || "en";
      const sText = data.source_text || request.body.sourceText || request.body.source || "";
      syncToTranslationMemory(sText, updateFields.target_text, sLang, targetLang);
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

        // Sync to Translation Memory (TM) in background
        if (updateFields.target_text && updateFields.target_text.trim().length > 0) {
          const sText = data.source_text || item.source || item.sourceText || templateSourceMap.get(segIndex) || "";
          syncToTranslationMemory(sText, updateFields.target_text, "en", targetLang);
        }
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

// 5. Admin-Only: Repair Corrupted source_text in Target-Lang Rows
// ─────────────────────────────────────────────────────────────────
// This endpoint resets source_text in ALL target-lang rows for a document
// back to the clean values stored in the template (target_lang IS NULL) rows.
// Safe: only source_text is written; target_text, status, verified etc. are untouched.
// Use case: fix tag-multiplication corruption caused by translate-batch writing
//           tag-embedded source text into target-lang rows.
segmentRouter.post([
  "/documents/:id/repair-source-text",
  "/api/documents/:id/repair-source-text"
], checkAuth, async (request, response) => {
  try {
    // Admin / super_admin / verbolabs_staff only
    const role = request.profile?.role || "";
    const isPrivileged = ["super_admin", "admin", "verbolabs_staff"].includes(role);
    if (!isPrivileged) {
      return response.status(403).json({ error: "Access Denied: Admin role required to run source text repair." });
    }

    const documentId = request.params.id;

    // 1. Fetch all template rows (target_lang IS NULL) — these are the ground truth
    const { data: templateSegs, error: tmplErr } = await supabase
      .from("document_segments")
      .select("segment_index, source_text")
      .eq("document_id", documentId)
      .is("target_lang", null);

    if (tmplErr) {
      console.error("[REPAIR_SOURCE] Failed to fetch template segments:", tmplErr.message);
      return response.status(500).json({ error: "Failed to fetch template segments: " + tmplErr.message });
    }

    if (!templateSegs || templateSegs.length === 0) {
      return response.status(404).json({ error: "No template segments found for this document." });
    }

    const templateMap = new Map();
    templateSegs.forEach(t => templateMap.set(t.segment_index, t.source_text || ""));

    console.log(`[REPAIR_SOURCE] Starting repair for doc ${documentId}: ${templateSegs.length} template segments`);

    // 2. Fetch all target-lang rows (target_lang IS NOT NULL) for this document
    const { data: targetRows, error: tgtErr } = await supabase
      .from("document_segments")
      .select("id, segment_index, source_text, target_lang")
      .eq("document_id", documentId)
      .not("target_lang", "is", null);

    if (tgtErr) {
      console.error("[REPAIR_SOURCE] Failed to fetch target rows:", tgtErr.message);
      return response.status(500).json({ error: "Failed to fetch target-lang segments: " + tgtErr.message });
    }

    if (!targetRows || targetRows.length === 0) {
      return response.json({ success: true, repaired: 0, message: "No target-lang rows found; nothing to repair." });
    }

    // 3. For each target-lang row, if source_text differs from template, update it
    let repairedCount = 0;
    let skippedCount = 0;
    const BATCH_SIZE = 100;

    // Group rows that need repair
    const rowsNeedingRepair = targetRows.filter(row => {
      const cleanTemplate = templateMap.get(row.segment_index) ?? null;
      if (cleanTemplate === null) return false; // No template row — skip
      return row.source_text !== cleanTemplate; // Only update if different
    });

    // Batch update in groups to avoid overwhelming the DB
    for (let i = 0; i < rowsNeedingRepair.length; i += BATCH_SIZE) {
      const batch = rowsNeedingRepair.slice(i, i + BATCH_SIZE);
      const updatePromises = batch.map(async (row) => {
        const cleanSource = templateMap.get(row.segment_index) || "";
        const { error: upErr } = await supabase
          .from("document_segments")
          .update({ source_text: cleanSource })
          .eq("id", row.id);
        if (upErr) {
          console.error(`[REPAIR_SOURCE] Failed to repair row id=${row.id} seg=${row.segment_index} lang=${row.target_lang}:`, upErr.message);
        } else {
          repairedCount++;
        }
      });
      await Promise.all(updatePromises);
    }

    skippedCount = targetRows.length - rowsNeedingRepair.length;

    console.log(`[REPAIR_SOURCE] ✅ Repair complete for doc ${documentId}: ${repairedCount} rows repaired, ${skippedCount} already clean.`);

    response.json({
      success: true,
      documentId,
      totalTargetRows: targetRows.length,
      repaired: repairedCount,
      alreadyClean: skippedCount,
      message: `Repair complete. ${repairedCount} source_text rows restored from template. ${skippedCount} rows were already clean.`
    });
  } catch (error) {
    console.error("[REPAIR_SOURCE] Unexpected error:", error);
    response.status(500).json({ error: "Repair failed: " + (error.message || "Unknown error") });
  }
});

module.exports = {
  segmentRouter
};
