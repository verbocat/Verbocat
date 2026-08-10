const express = require("express");
const { supabase, fetchAllSegments } = require("../config/supabase");
const { checkAuth, checkTranslateAccess, checkDocumentAccess } = require("../utils/authMiddleware");
const { translateSegments } = require("../services/translationService");
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
    const { results, wordCount } = await translateSegments(segments, target, source, updatedContextSettings, request.user.id, organizationId);
    
    if (documentId && results && results.length > 0) {
      const { getIo } = require("../services/socket");
      const io = getIo();

      const updatePromises = results.map(async (item) => {
        const segmentIndex = item.id - 1;

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

        const { error } = await supabase
          .from("document_segments")
          .update(updateFields)
          .eq("document_id", documentId)
          .eq("target_lang", target)
          .eq("segment_index", segmentIndex);

        if (!error && io) {
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

    const updateFields = {
      target_text: targetText !== undefined ? targetText : "",
      status: status || "draft",
      updated_at: new Date().toISOString()
    };

    if (mqmAccuracyScore !== undefined) updateFields.mqm_accuracy_score = mqmAccuracyScore;
    if (mqmReport !== undefined) updateFields.mqm_report = mqmReport;
    if (originalTargetText !== undefined) updateFields.original_target_text = originalTargetText;
    if (trackedBy !== undefined) updateFields.tracked_by = trackedBy;

    const segIndex = Number(index);

    // 1. Try updating existing row matching target_lang = targetLang
    let { data, error } = await supabase
      .from("document_segments")
      .update(updateFields)
      .eq("document_id", id)
      .eq("segment_index", segIndex)
      .eq("target_lang", targetLang)
      .select()
      .maybeSingle();

    // 2. If no row matched target_lang, try updating row matching target_lang IS NULL
    if (!data) {
      const { data: nullRow } = await supabase
        .from("document_segments")
        .update({
          ...updateFields,
          target_lang: targetLang
        })
        .eq("document_id", id)
        .eq("segment_index", segIndex)
        .is("target_lang", null)
        .select()
        .maybeSingle();

      data = nullRow;
    }

    // 3. If STILL no row found, upsert a brand new row
    if (!data) {
      const { data: inserted, error: insErr } = await supabase
        .from("document_segments")
        .upsert(
          {
            document_id: id,
            segment_index: segIndex,
            target_lang: targetLang,
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
        segmentIndex: Number(index),
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

    for (const item of updates) {
      const { segmentIndex, targetText, status, originalTargetText, trackedBy } = item;
      const segIndex = Number(segmentIndex);

      if (isNaN(segIndex)) continue;

      const updateFields = {
        target_text: targetText !== undefined ? targetText : "",
        status: status || "draft",
        updated_at: new Date().toISOString()
      };

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

      // 2. If no row matched target_lang, try updating row with target_lang IS NULL
      if (!data) {
        const { data: nullRow } = await supabase
          .from("document_segments")
          .update({ ...updateFields, target_lang: targetLang })
          .eq("document_id", id)
          .eq("segment_index", segIndex)
          .is("target_lang", null)
          .select()
          .maybeSingle();
        data = nullRow;
      }

      // 3. If STILL no row found, upsert a brand new row
      if (!data) {
        const { data: inserted, error: insErr } = await supabase
          .from("document_segments")
          .upsert({
            document_id: id,
            segment_index: segIndex,
            target_lang: targetLang,
            target_text: updateFields.target_text || "",
            status: updateFields.status || "draft",
            original_target_text: updateFields.original_target_text || null,
            tracked_by: updateFields.tracked_by || null,
            updated_at: updateFields.updated_at
          }, { onConflict: "document_id,segment_index,target_lang" })
          .select()
          .single();

        if (insErr) {
          console.error(`Bulk Segment Upsert Error for index ${segIndex}:`, insErr);
          continue;
        }
        data = inserted;
      }

      results.push(data);

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
