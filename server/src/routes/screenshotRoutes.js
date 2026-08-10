const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { supabase } = require("../config/supabase");
const { checkAuth } = require("../utils/authMiddleware");
const axios = require("axios");

const screenshotRouter = express.Router();

const uploadDir = path.join(__dirname, "../../uploads/screenshots");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const ALLOWED_IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"];

// 1. Upload Screenshot for Document / Project
screenshotRouter.post(
  ["/documents/:documentId/screenshots", "/api/documents/:documentId/screenshots"],
  checkAuth,
  upload.single("screenshot"),
  async (req, res) => {
    try {
      const { documentId } = req.params;
      const { caption, projectId } = req.body;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: "No screenshot image file provided." });
      }

      const ext = path.extname(file.originalname).toLowerCase();
      if (!ALLOWED_IMAGE_EXTS.includes(ext)) {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        return res.status(400).json({ error: `Invalid image type. Allowed: ${ALLOWED_IMAGE_EXTS.join(", ")}` });
      }

      // Read file and convert to base64 data URL for instant frontend rendering & storage
      const fileBuffer = fs.readFileSync(file.path);
      const base64Data = fileBuffer.toString("base64");
      const mimeType = file.mimetype || "image/png";
      const imageUrl = `data:${mimeType};base64,${base64Data}`;

      // Clean up disk upload file
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

      const activeTenantId = req.tenant?.id || req.profile?.organization_id || null;

      const { data: screenshot, error } = await supabase
        .from("document_screenshots")
        .insert({
          document_id: documentId,
          project_id: projectId || null,
          image_url: imageUrl,
          filename: file.originalname,
          caption: caption || file.originalname,
          uploaded_by: req.user.id
        })
        .select()
        .single();

      if (error) {
        console.error("Insert Screenshot Error:", error);
        return res.status(500).json({ error: error.message || "Failed to save screenshot record." });
      }

      return res.json({ success: true, screenshot });
    } catch (err) {
      console.error("Upload Screenshot Exception:", err);
      return res.status(500).json({ error: err.message || "Failed to upload screenshot." });
    }
  }
);

// 2. Fetch All Screenshots and Links for a Document
screenshotRouter.get(
  ["/documents/:documentId/screenshots", "/api/documents/:documentId/screenshots"],
  checkAuth,
  async (req, res) => {
    try {
      const { documentId } = req.params;

      const { data: screenshots, error: shotErr } = await supabase
        .from("document_screenshots")
        .select("*")
        .eq("document_id", documentId)
        .order("created_at", { ascending: false });

      if (shotErr) {
        return res.status(500).json({ error: shotErr.message });
      }

      const { data: links, error: linkErr } = await supabase
        .from("segment_screenshot_links")
        .select("*")
        .eq("document_id", documentId);

      return res.json({
        screenshots: screenshots || [],
        links: links || []
      });
    } catch (err) {
      console.error("Fetch Screenshots Exception:", err);
      return res.status(500).json({ error: err.message || "Failed to fetch screenshots." });
    }
  }
);

// 3. Link or Unlink Segment to a Screenshot
screenshotRouter.post(
  ["/segments/:segmentId/screenshot-link", "/api/segments/:segmentId/screenshot-link"],
  checkAuth,
  async (req, res) => {
    try {
      const segmentId = parseInt(req.params.segmentId, 10);
      const { documentId, screenshotId, boundingBox, unlink } = req.body;

      if (unlink) {
        const { error } = await supabase
          .from("segment_screenshot_links")
          .delete()
          .eq("segment_id", segmentId)
          .eq("screenshot_id", screenshotId);

        if (error) throw error;
        return res.json({ success: true, message: "Screenshot link removed." });
      }

      if (!screenshotId || !documentId) {
        return res.status(400).json({ error: "screenshotId and documentId are required." });
      }

      const { data: link, error } = await supabase
        .from("segment_screenshot_links")
        .upsert(
          {
            segment_id: segmentId,
            document_id: documentId,
            screenshot_id: screenshotId,
            bounding_box: boundingBox || null
          },
          { onConflict: "screenshot_id,segment_id" }
        )
        .select()
        .single();

      if (error) throw error;

      return res.json({ success: true, link });
    } catch (err) {
      console.error("Link Screenshot Exception:", err);
      return res.status(500).json({ error: err.message || "Failed to link screenshot." });
    }
  }
);

// 4. Delete Screenshot
screenshotRouter.delete(
  ["/screenshots/:id", "/api/screenshots/:id"],
  checkAuth,
  async (req, res) => {
    try {
      const { id } = req.params;

      const { error } = await supabase
        .from("document_screenshots")
        .delete()
        .eq("id", id);

      if (error) throw error;

      return res.json({ success: true, message: "Screenshot deleted successfully." });
    } catch (err) {
      console.error("Delete Screenshot Exception:", err);
      return res.status(500).json({ error: err.message || "Failed to delete screenshot." });
    }
  }
);

module.exports = {
  screenshotRouter
};
