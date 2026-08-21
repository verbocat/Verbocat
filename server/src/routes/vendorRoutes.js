const express = require("express");
const { supabase, supabaseAdmin } = require("../config/supabase");
const { checkAuth, checkRole } = require("../utils/authMiddleware");
const { sendEmail } = require("../utils/mailer");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const vendorRouter = express.Router();

// Ensure vendor uploads directory exists
const vendorUploadDir = path.join(__dirname, "../../uploads/vendor");
if (!fs.existsSync(vendorUploadDir)) {
  fs.mkdirSync(vendorUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: vendorUploadDir,
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const validatePasswordSecurity = (pass) => {
  if (!pass || pass.length < 8) return "Password must be at least 8 characters long.";
  if (!/[A-Z]/.test(pass)) return "Password must contain at least one uppercase letter (A-Z).";
  if (!/[0-9]/.test(pass)) return "Password must contain at least one number (0-9).";
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pass)) return "Password must contain at least one special character (!@#$%^&*...).";
  return null;
};

// ==========================================
// PUBLIC ENDPOINTS (no auth required)
// ==========================================
// NOTE: Linguist signup is handled by the main /api/auth/register endpoint.
// Non-@verbolabs.com emails are automatically assigned role='linguist'.

// Upload CV/Portfolio document (used during signup and profile editing)
vendorRouter.post("/upload-document", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }
  return res.json({ url: `/uploads/vendor/${req.file.filename}` });
});

// ==========================================
// AUTHENTICATED ENDPOINTS (vendor role required)
// ==========================================
vendorRouter.use(checkAuth);
vendorRouter.use(checkRole(["vendor", "admin"]));

// Dashboard Statistics
vendorRouter.get("/dashboard/stats", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("linguist_profiles")
      .select("status");

    if (error) throw error;

    const stats = { pending: 0, under_review: 0, approved: 0, rejected: 0, total: 0 };
    (data || []).forEach(p => {
      stats.total++;
      if (p.status === "pending_review") stats.pending++;
      else if (p.status === "under_review") stats.under_review++;
      else if (p.status === "approved") stats.approved++;
      else if (p.status === "rejected") stats.rejected++;
    });

    return res.json(stats);
  } catch (error) {
    console.error("[VendorDashboard] Stats error:", error);
    return res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
});

// List Onboarding Requests
vendorRouter.get("/onboarding-requests", async (req, res) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabase
      .from("linguist_profiles")
      .select("*", { count: "exact" });

    // Filter by onboarding statuses unless specific status is requested
    if (status) {
      query = query.eq("status", status);
    } else {
      query = query.in("status", ["pending_review", "under_review"]);
    }

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (error) throw error;

    return res.json({
      requests: data || [],
      total: count || 0,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error("[VendorOnboarding] Error:", error);
    return res.status(500).json({ error: "Failed to fetch onboarding requests" });
  }
});

// List Linguists (Database)
vendorRouter.get("/linguists", async (req, res) => {
  try {
    const {
      search, country, language, source_lang, target_lang,
      min_experience, max_rate, availability, status,
      page = 1, limit = 20
    } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabase
      .from("linguist_profiles")
      .select("*", { count: "exact" });

    // Default to approved linguists if no status filter
    if (status) {
      query = query.eq("status", status);
    } else {
      query = query.eq("status", "approved");
    }

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    }
    if (country) {
      query = query.ilike("country", `%${country}%`);
    }
    if (language) {
      query = query.or(`primary_language.ilike.%${language}%`);
    }
    if (availability) {
      query = query.eq("availability", availability);
    }
    if (min_experience) {
      query = query.gte("years_of_experience", parseInt(min_experience));
    }
    if (max_rate) {
      query = query.lte("translation_rate_per_word", parseFloat(max_rate));
    }

    const { data: linguists, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (error) throw error;

    return res.json({
      linguists: linguists || [],
      total: count || 0,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error("[VendorLinguists] Error:", error);
    return res.status(500).json({ error: "Failed to fetch linguists" });
  }
});

// Get Single Linguist Profile
vendorRouter.get("/linguists/:id", async (req, res) => {
  try {
    const linguistId = req.params.id;

    const { data: linguist, error: linguistError } = await supabase
      .from("linguist_profiles")
      .select("*")
      .eq("id", linguistId)
      .single();

    if (linguistError) throw linguistError;

    const { data: languagePairs } = await supabase
      .from("linguist_language_pairs")
      .select("*")
      .eq("linguist_profile_id", linguistId)
      .order("created_at", { ascending: true });

    const { data: history } = await supabase
      .from("linguist_profile_history")
      .select("*")
      .eq("linguist_profile_id", linguistId)
      .order("created_at", { ascending: false });

    return res.json({
      linguist,
      languagePairs: languagePairs || [],
      history: history || []
    });
  } catch (error) {
    console.error("[VendorLinguist] Get error:", error);
    return res.status(500).json({ error: "Failed to fetch linguist details" });
  }
});

// Update Linguist Profile
vendorRouter.put("/linguists/:id", async (req, res) => {
  try {
    const linguistId = req.params.id;
    const updates = { ...req.body };

    // Fetch old record for change tracking
    const { data: oldLinguist, error: fetchError } = await supabase
      .from("linguist_profiles")
      .select("*")
      .eq("id", linguistId)
      .single();

    if (fetchError) throw fetchError;

    updates.updated_at = new Date().toISOString();

    const { data: linguist, error } = await supabase
      .from("linguist_profiles")
      .update(updates)
      .eq("id", linguistId)
      .select()
      .single();

    if (error) throw error;

    // Create history records for each changed field
    const skipFields = ["updated_at", "id", "created_at"];
    const historyEntries = [];
    const reviewerName = req.profile?.full_name || req.profile?.name || req.user?.email || "Vendor";

    for (const key of Object.keys(updates)) {
      if (skipFields.includes(key)) continue;
      const oldVal = oldLinguist[key];
      const newVal = updates[key];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        const label = key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        historyEntries.push({
          linguist_profile_id: linguistId,
          action: "profile_updated",
          details: `${label} changed from "${oldVal || "empty"}" to "${newVal}"`,
          changed_by: req.user.id
        });
      }
    }

    if (historyEntries.length > 0) {
      await supabase.from("linguist_profile_history").insert(historyEntries);
    }

    return res.json({ message: "Profile updated successfully", linguist });
  } catch (error) {
    console.error("[VendorLinguist] Update error:", error);
    return res.status(500).json({ error: "Failed to update linguist profile" });
  }
});

// Change Linguist Status (approve/reject/review)
vendorRouter.put("/linguists/:id/status", async (req, res) => {
  try {
    const linguistId = req.params.id;
    const { status } = req.body;

    if (!["under_review", "approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Invalid status. Must be: under_review, approved, or rejected." });
    }

    const updates = {
      status,
      updated_at: new Date().toISOString(),
      reviewed_by: req.user.id,
      reviewed_at: new Date().toISOString()
    };

    const { data: linguist, error } = await supabase
      .from("linguist_profiles")
      .update(updates)
      .eq("id", linguistId)
      .select()
      .single();

    if (error) throw error;

    // If approving, also update the linked auth user's profile status
    if (status === "approved" && linguist.user_id) {
      await supabase
        .from("profiles")
        .update({ status: "active" })
        .eq("id", linguist.user_id);
    }

    const reviewerName = req.profile?.full_name || req.profile?.name || req.user?.email || "Vendor";
    const actionLabel = status === "approved" ? "approved" : status === "rejected" ? "rejected" : "placed under review";

    await supabase.from("linguist_profile_history").insert({
      linguist_profile_id: linguistId,
      action: `profile_${status}`,
      details: `Profile ${actionLabel} by ${reviewerName}`,
      changed_by: req.user.id
    });

    return res.json({ message: `Linguist profile ${actionLabel} successfully`, linguist });
  } catch (error) {
    console.error("[VendorLinguist] Status change error:", error);
    return res.status(500).json({ error: "Failed to update linguist status" });
  }
});

// Create Linguist (manual creation by vendor team)
vendorRouter.post("/linguists", async (req, res) => {
  try {
    const { full_name, email, language_pairs, ...profileData } = req.body;

    if (!full_name || !email) {
      return res.status(400).json({ error: "Full name and email are required." });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const { data: linguist, error } = await supabase
      .from("linguist_profiles")
      .insert({
        full_name,
        email: normalizedEmail,
        status: profileData.status || "pending_review",
        ...profileData
      })
      .select()
      .single();

    if (error) throw error;

    const linguistProfileId = linguist.id;

    // Insert language pairs if provided
    if (language_pairs && Array.isArray(language_pairs) && language_pairs.length > 0) {
      const pairsToInsert = language_pairs
        .filter(p => p.source_language && p.target_language)
        .map(pair => ({
          linguist_profile_id: linguistProfileId,
          source_language: pair.source_language,
          target_language: pair.target_language,
          proficiency: pair.proficiency || "professional",
          status: "pending"
        }));
      if (pairsToInsert.length > 0) {
        await supabase.from("linguist_language_pairs").insert(pairsToInsert);
      }
    }

    const creatorName = req.profile?.full_name || req.profile?.name || req.user?.email || "Vendor";
    await supabase.from("linguist_profile_history").insert({
      linguist_profile_id: linguistProfileId,
      action: "profile_created",
      details: `Profile manually created by ${creatorName}`,
      changed_by: req.user.id
    });

    return res.status(201).json({ message: "Linguist profile created successfully", linguist });
  } catch (error) {
    console.error("[VendorLinguist] Create error:", error);
    return res.status(500).json({ error: "Failed to create linguist profile" });
  }
});

// ==========================================
// LANGUAGE PAIR ENDPOINTS
// ==========================================

// Get Language Pairs for a Linguist
vendorRouter.get("/linguists/:id/language-pairs", async (req, res) => {
  try {
    const { data: languagePairs, error } = await supabase
      .from("linguist_language_pairs")
      .select("*")
      .eq("linguist_profile_id", req.params.id)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return res.json({ languagePairs: languagePairs || [] });
  } catch (error) {
    console.error("[VendorPairs] Get error:", error);
    return res.status(500).json({ error: "Failed to fetch language pairs" });
  }
});

// Add Language Pair
vendorRouter.post("/linguists/:id/language-pairs", async (req, res) => {
  try {
    const linguistId = req.params.id;
    const { source_language, target_language, proficiency } = req.body;

    if (!source_language || !target_language) {
      return res.status(400).json({ error: "Source and target language are required." });
    }

    const { data: pair, error } = await supabase
      .from("linguist_language_pairs")
      .insert({
        linguist_profile_id: linguistId,
        source_language,
        target_language,
        proficiency: proficiency || "professional",
        status: "pending"
      })
      .select()
      .single();

    if (error) throw error;

    await supabase.from("linguist_profile_history").insert({
      linguist_profile_id: linguistId,
      action: "language_pair_added",
      details: `Language pair ${source_language} → ${target_language} added`,
      changed_by: req.user.id
    });

    return res.status(201).json({ message: "Language pair added", pair });
  } catch (error) {
    console.error("[VendorPairs] Add error:", error);
    return res.status(500).json({ error: "Failed to add language pair" });
  }
});

// Update Language Pair (approve/reject/change proficiency)
vendorRouter.put("/language-pairs/:pairId", async (req, res) => {
  try {
    const { pairId } = req.params;
    const { status, proficiency } = req.body;

    // Fetch existing pair for history logging
    const { data: oldPair, error: fetchError } = await supabase
      .from("linguist_language_pairs")
      .select("*")
      .eq("id", pairId)
      .single();

    if (fetchError) throw fetchError;

    const updates = {};
    if (status) updates.status = status;
    if (proficiency) updates.proficiency = proficiency;

    if (status === "approved") {
      updates.approved_by = req.user.id;
      updates.approved_at = new Date().toISOString();
    }

    const { data: pair, error } = await supabase
      .from("linguist_language_pairs")
      .update(updates)
      .eq("id", pairId)
      .select()
      .single();

    if (error) throw error;

    // Log status change to history
    if (status && oldPair.status !== status) {
      await supabase.from("linguist_profile_history").insert({
        linguist_profile_id: oldPair.linguist_profile_id,
        action: `language_pair_${status}`,
        details: `${oldPair.source_language} → ${oldPair.target_language} ${status}`,
        changed_by: req.user.id
      });
    }

    return res.json({ message: "Language pair updated", pair });
  } catch (error) {
    console.error("[VendorPairs] Update error:", error);
    return res.status(500).json({ error: "Failed to update language pair" });
  }
});

// Delete Language Pair
vendorRouter.delete("/language-pairs/:pairId", async (req, res) => {
  try {
    const { pairId } = req.params;

    // Fetch pair details before deleting for history log
    const { data: pair, error: fetchError } = await supabase
      .from("linguist_language_pairs")
      .select("*")
      .eq("id", pairId)
      .single();

    if (fetchError) throw fetchError;

    const { error } = await supabase
      .from("linguist_language_pairs")
      .delete()
      .eq("id", pairId);

    if (error) throw error;

    await supabase.from("linguist_profile_history").insert({
      linguist_profile_id: pair.linguist_profile_id,
      action: "language_pair_removed",
      details: `Language pair ${pair.source_language} → ${pair.target_language} removed`,
      changed_by: req.user.id
    });

    return res.json({ message: "Language pair deleted" });
  } catch (error) {
    console.error("[VendorPairs] Delete error:", error);
    return res.status(500).json({ error: "Failed to delete language pair" });
  }
});

// ==========================================
// HISTORY ENDPOINT
// ==========================================

// Get Profile History
vendorRouter.get("/linguists/:id/history", async (req, res) => {
  try {
    const { data: history, error } = await supabase
      .from("linguist_profile_history")
      .select("*")
      .eq("linguist_profile_id", req.params.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return res.json({ history: history || [] });
  } catch (error) {
    console.error("[VendorHistory] Error:", error);
    return res.status(500).json({ error: "Failed to fetch profile history" });
  }
});

module.exports = { vendorRouter };
