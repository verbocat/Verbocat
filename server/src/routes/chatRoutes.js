const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { supabase } = require("../config/supabase");
const { checkAuth } = require("../utils/authMiddleware");
const { getIo } = require("../services/socket");

const chatRouter = express.Router();

// Ensure uploads/support directory exists
const uploadDir = path.join(__dirname, "../../uploads/support");
fs.mkdirSync(uploadDir, { recursive: true });

// Multer setup for chat file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e6)}-${file.originalname}`;
    cb(null, uniqueName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|svg|pdf|doc|docx|xls|xlsx|txt|zip/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype) || file.mimetype.startsWith("image/");
    cb(null, ext || mime);
  }
});

// All routes require authentication
chatRouter.use(checkAuth);

// Helper to check if user is staff/admin
const isStaff = (profile) => ["admin", "verbolabs_staff"].includes(profile.role);

// Helper to get project creator/owner for a document
async function getProjectCreatorId(documentId) {
  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .select("id, owner_id, project_id")
    .eq("id", documentId)
    .single();

  if (docErr || !doc) return null;

  if (doc.project_id) {
    const { data: project } = await supabase
      .from("projects")
      .select("owner_id")
      .eq("id", doc.project_id)
      .single();

    if (project && project.owner_id) {
      return project.owner_id;
    }
  }

  return doc.owner_id; // fallback to document owner
}

// Helper to map profile information
const mapProfile = (p) => {
  if (!p) return null;
  const name = p.email ? p.email.split("@")[0] : "User";
  return {
    id: p.id,
    email: p.email,
    role: p.role,
    name: name,
    full_name: name
  };
};

// ─── GET /queries ─────────────────────────────────────────────
// Retrieve support queries. Filters: documentId (optional)
chatRouter.get("/queries", async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.profile.role;
    const { documentId } = req.query;

    let dbQuery = supabase.from("support_queries").select("*");

    if (documentId) {
      dbQuery = dbQuery.eq("document_id", documentId);
    }

    // Role-based filtering:
    // Linguists only see queries they created.
    // Staff/Admin see queries they are creators of (project owners) or all queries.
    if (userRole === "linguist") {
      dbQuery = dbQuery.eq("linguist_id", userId);
    }

    const { data: queries, error: queriesErr } = await dbQuery.order("updated_at", { ascending: false });

    if (queriesErr) throw queriesErr;
    if (!queries || queries.length === 0) {
      return res.json([]);
    }

    // Enrich queries with document name, linguist profile, and creator profile
    const enriched = await Promise.all(queries.map(async (q) => {
      // Document info
      const { data: doc } = await supabase
        .from("documents")
        .select("name, owner_id, project_id")
        .eq("id", q.document_id)
        .single();

      // Linguist info
      const { data: linguistProfile } = await supabase
        .from("profiles")
        .select("id, email, role")
        .eq("id", q.linguist_id)
        .single();

      // Get project creator
      const projectCreatorId = await getProjectCreatorId(q.document_id);
      const { data: creatorProfile } = await supabase
        .from("profiles")
        .select("id, email, role")
        .eq("id", projectCreatorId)
        .single();

      // Filter queries for staff: make sure staff only sees queries for projects they own (if not admin)
      if (userRole === "verbolabs_staff" && projectCreatorId !== userId) {
        return null;
      }

      // Fetch last message
      const { data: lastMsgs } = await supabase
        .from("support_messages")
        .select("*")
        .eq("query_id", q.id)
        .order("created_at", { ascending: false })
        .limit(1);

      const lastMessage = lastMsgs && lastMsgs.length > 0 ? lastMsgs[0] : null;

      return {
        ...q,
        document_name: doc ? doc.name : "Unknown Document",
        project_creator_id: projectCreatorId,
        linguist: mapProfile(linguistProfile),
        creator: mapProfile(creatorProfile),
        lastMessage,
        last_message: lastMessage
      };
    }));

    // Filter out null values (if staff user was not the project owner)
    res.json(enriched.filter(Boolean));
  } catch (err) {
    console.error("GET /queries error:", err);
    res.status(500).json({ error: "Failed to fetch queries" });
  }
});

// ─── POST /queries ────────────────────────────────────────────
// Create a new support query (Linguist raises for self, or Staff contacts assigned linguist directly)
chatRouter.post("/queries", async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.profile.role;
    const { documentId, queryType, segmentIndex, topic, message, linguistId } = req.body;

    if (!documentId || !queryType || !topic || !message) {
      return res.status(400).json({ error: "documentId, queryType, topic, and message are required" });
    }

    if (!["segment", "file"].includes(queryType)) {
      return res.status(400).json({ error: "queryType must be either 'segment' or 'file'" });
    }

    // Get project creator / owner
    const projectCreatorId = await getProjectCreatorId(documentId);
    if (!projectCreatorId) {
      return res.status(404).json({ error: "Project creator not found for this document." });
    }

    let finalLinguistId = null;

    if (userRole === "linguist") {
      // Linguist raising query
      finalLinguistId = userId;

      // Verify linguist has access to this file
      const { data: access } = await supabase
        .from("document_access")
        .select("*")
        .eq("document_id", documentId)
        .eq("user_id", userId)
        .single();

      if (!access) {
        return res.status(403).json({ error: "You do not have access to this document." });
      }
    } else {
      // Staff/Admin initiating contact with a linguist
      const isCreator = projectCreatorId === userId;
      const isSystemAdmin = userRole === "admin";

      if (!isCreator && !isSystemAdmin) {
        return res.status(403).json({ error: "Access denied. Only the project creator or admins can contact linguists directly." });
      }

      if (!linguistId) {
        return res.status(400).json({ error: "linguistId is required for staff to initiate contact." });
      }

      finalLinguistId = linguistId;

      // Verify target linguist has access to this file
      const { data: access } = await supabase
        .from("document_access")
        .select("*")
        .eq("document_id", documentId)
        .eq("user_id", linguistId)
        .single();

      if (!access) {
        return res.status(400).json({ error: "The target user is not assigned/does not have access to this document." });
      }
    }

    // 1. Create support query
    const { data: query, error: queryErr } = await supabase
      .from("support_queries")
      .insert({
        document_id: documentId,
        linguist_id: finalLinguistId,
        query_type: queryType,
        segment_index: queryType === "segment" ? parseInt(segmentIndex) : null,
        topic,
        status: "open"
      })
      .select()
      .single();

    if (queryErr) throw queryErr;

    // 2. Insert initial message
    const { data: firstMsg, error: msgErr } = await supabase
      .from("support_messages")
      .insert({
        query_id: query.id,
        sender_id: userId,
        content: message
      })
      .select()
      .single();

    if (msgErr) throw msgErr;

    // Enrich query info for response
    const { data: doc } = await supabase.from("documents").select("name").eq("id", documentId).single();
    const { data: linguistRaw } = await supabase.from("profiles").select("id, email, role").eq("id", finalLinguistId).single();
    const { data: creatorRaw } = await supabase.from("profiles").select("id, email, role").eq("id", projectCreatorId).single();

    const result = {
      ...query,
      document_name: doc ? doc.name : "Unknown Document",
      project_creator_id: projectCreatorId,
      linguist: mapProfile(linguistRaw),
      creator: mapProfile(creatorRaw),
      lastMessage: firstMsg,
      last_message: firstMsg
    };

    // Notify the other party via socket
    const io = getIo();
    if (io) {
      const recipientId = userRole === "linguist" ? projectCreatorId : finalLinguistId;
      io.to(`document_chat:${documentId}`).emit("support:query-created", result);
      io.to(`user:${recipientId}`).emit("support:query-created", result);
    }

    res.json(result);
  } catch (err) {
    console.error("POST /queries error:", err);
    res.status(500).json({ error: "Failed to create support query" });
  }
});

// ─── GET /queries/:queryId/messages ───────────────────────────
// Fetch messages for a specific query
chatRouter.get("/queries/:queryId/messages", async (req, res) => {
  try {
    const userId = req.user.id;
    const { queryId } = req.params;

    // Get query details to check permissions
    const { data: query, error: queryErr } = await supabase
      .from("support_queries")
      .select("*")
      .eq("id", queryId)
      .single();

    if (queryErr || !query) {
      return res.status(404).json({ error: "Support query not found" });
    }

    const projectCreatorId = await getProjectCreatorId(query.document_id);

    // Permission check: only linguist who raised it, project creator, or admin can read messages
    const isOwnerOrCreator = query.linguist_id === userId || projectCreatorId === userId;
    const isSystemAdmin = req.profile.role === "admin";

    if (!isOwnerOrCreator && !isSystemAdmin) {
      return res.status(403).json({ error: "Access denied to support query messages." });
    }

    // Fetch messages
    const { data: messages, error: msgErr } = await supabase
      .from("support_messages")
      .select("*")
      .eq("query_id", queryId)
      .order("created_at", { ascending: true });

    if (msgErr) throw msgErr;

    // Enrich messages with sender profiles
    const enrichedMessages = await Promise.all(messages.map(async (m) => {
      const { data: sender } = await supabase
        .from("profiles")
        .select("id, email, role")
        .eq("id", m.sender_id)
        .single();
      return {
        ...m,
        sender: mapProfile(sender)
      };
    }));

    res.json(enrichedMessages);
  } catch (err) {
    console.error("GET messages error:", err);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// ─── POST /queries/:queryId/messages ──────────────────────────
// Send message in a support query
chatRouter.post("/queries/:queryId/messages", async (req, res) => {
  try {
    const userId = req.user.id;
    const { queryId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Content is required" });
    }

    // Fetch support query to verify permissions and get recipient
    const { data: query, error: queryErr } = await supabase
      .from("support_queries")
      .select("*")
      .eq("id", queryId)
      .single();

    if (queryErr || !query) {
      return res.status(404).json({ error: "Support query not found" });
    }

    const projectCreatorId = await getProjectCreatorId(query.document_id);

    // Permission check
    const isLinguist = query.linguist_id === userId;
    const isCreator = projectCreatorId === userId;
    const isSystemAdmin = req.profile.role === "admin";

    if (!isLinguist && !isCreator && !isSystemAdmin) {
      return res.status(403).json({ error: "Access denied." });
    }

    // If query is closed, do not allow sending messages
    if (query.status === "closed") {
      return res.status(400).json({ error: "Cannot send messages to a closed support query." });
    }

    // Create message
    const { data: msg, error: msgErr } = await supabase
      .from("support_messages")
      .insert({
        query_id: queryId,
        sender_id: userId,
        content: content.trim()
      })
      .select()
      .single();

    if (msgErr) throw msgErr;

    // Update query updated_at time
    await supabase
      .from("support_queries")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", queryId);

    const enriched = {
      ...msg,
      sender: mapProfile(req.profile)
    };

    // Emit message to Socket query room
    const io = getIo();
    if (io) {
      io.to(`document_chat:${query.document_id}`).emit("support:new-message", enriched);

      // Also trigger a notification for the other party if they are online
      const recipientId = isLinguist ? projectCreatorId : query.linguist_id;
      io.to(`user:${recipientId}`).emit("support:message-notification", {
        queryId,
        message: enriched
      });
    }

    res.json(enriched);
  } catch (err) {
    console.error("POST message error:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// ─── POST /queries/:queryId/upload ────────────────────────────
// Upload attachment to support query
chatRouter.post("/queries/:queryId/upload", upload.single("file"), async (req, res) => {
  try {
    const userId = req.user.id;
    const { queryId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Fetch support query to verify permissions
    const { data: query, error: queryErr } = await supabase
      .from("support_queries")
      .select("*")
      .eq("id", queryId)
      .single();

    if (queryErr || !query) {
      return res.status(404).json({ error: "Support query not found" });
    }

    const projectCreatorId = await getProjectCreatorId(query.document_id);
    const isLinguist = query.linguist_id === userId;
    const isCreator = projectCreatorId === userId;
    const isSystemAdmin = req.profile.role === "admin";

    if (!isLinguist && !isCreator && !isSystemAdmin) {
      return res.status(403).json({ error: "Access denied." });
    }

    const relativePath = `/uploads/support/${file.filename}`;

    // Create message with attachment
    const { data: msg, error: msgErr } = await supabase
      .from("support_messages")
      .insert({
        query_id: queryId,
        sender_id: userId,
        content: `Uploaded attachment: ${file.originalname}`,
        attachment_url: relativePath,
        attachment_name: file.originalname,
        attachment_type: file.mimetype
      })
      .select()
      .single();

    if (msgErr) throw msgErr;

    // Update query updated_at time
    await supabase
      .from("support_queries")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", queryId);

    const enriched = {
      ...msg,
      sender: mapProfile(req.profile)
    };

    // Emit to Socket query room
    const io = getIo();
    if (io) {
      io.to(`document_chat:${query.document_id}`).emit("support:new-message", enriched);

      const recipientId = isLinguist ? projectCreatorId : query.linguist_id;
      io.to(`user:${recipientId}`).emit("support:message-notification", {
        queryId,
        message: enriched
      });
    }

    res.json(enriched);
  } catch (err) {
    console.error("POST upload error:", err);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

// ─── PUT /queries/:queryId/resolve ────────────────────────────
// Resolve support query
chatRouter.put("/queries/:queryId/resolve", async (req, res) => {
  try {
    const userId = req.user.id;
    const { queryId } = req.params;
    const { status } = req.body; // 'resolved' or 'closed'

    const targetStatus = status === "closed" ? "closed" : "resolved";

    // Fetch query details
    const { data: query, error: queryErr } = await supabase
      .from("support_queries")
      .select("*")
      .eq("id", queryId)
      .single();

    if (queryErr || !query) {
      return res.status(404).json({ error: "Support query not found" });
    }

    const projectCreatorId = await getProjectCreatorId(query.document_id);
    const isLinguist = query.linguist_id === userId;
    const isCreator = projectCreatorId === userId;
    const isSystemAdmin = req.profile.role === "admin";

    if (!isCreator && !isSystemAdmin) {
      return res.status(403).json({ error: "Access denied. Only the project creator (owner) or admins can resolve queries." });
    }

    // Update status
    const { data: updated, error: updateErr } = await supabase
      .from("support_queries")
      .update({ status: targetStatus, updated_at: new Date().toISOString() })
      .eq("id", queryId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // Send system message in the thread
    const { data: systemMsg } = await supabase
      .from("support_messages")
      .insert({
        query_id: queryId,
        sender_id: userId,
        content: `[System] The query status was updated to ${targetStatus}.`
      })
      .select()
      .single();

    const enrichedSystemMsg = {
      ...systemMsg,
      sender: mapProfile(req.profile)
    };

    // Emit socket events
    const io = getIo();
    if (io) {
      io.to(`document_chat:${query.document_id}`).emit("support:query-updated", {
        query: updated,
        message: enrichedSystemMsg
      });

      const recipientId = isLinguist ? projectCreatorId : query.linguist_id;
      io.to(`user:${recipientId}`).emit("support:query-updated", {
        query: updated,
        message: enrichedSystemMsg
      });
    }

    res.json(updated);
  } catch (err) {
    console.error("Resolve query error:", err);
    res.status(500).json({ error: "Failed to update query status" });
  }
});

// ─── GET /documents/:documentId/linguists ─────────────────────
// Fetch all assigned linguists for a document (Staff only)
chatRouter.get("/documents/:documentId/linguists", async (req, res) => {
  try {
    const { documentId } = req.params;
    
    // Get document access users
    const { data: accessRows, error: accessErr } = await supabase
      .from("document_access")
      .select("user_id")
      .eq("document_id", documentId);

    if (accessErr) throw accessErr;
    if (!accessRows || accessRows.length === 0) {
      return res.json([]);
    }

    const userIds = accessRows.map(r => r.user_id);

    // Get profiles of role linguist
    const { data: profiles, error: profilesErr } = await supabase
      .from("profiles")
      .select("id, email, role")
      .in("id", userIds)
      .eq("role", "linguist");

    if (profilesErr) throw profilesErr;

    res.json((profiles || []).map(mapProfile));
  } catch (err) {
    console.error("GET document linguists error:", err);
    res.status(500).json({ error: "Failed to fetch linguists" });
  }
});

// ─── DELETE /messages/:messageId ──────────────────────────────
// Delete a chat message for everyone
chatRouter.delete("/messages/:messageId", async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;

    // Fetch message
    const { data: msg, error: msgErr } = await supabase
      .from("support_messages")
      .select("*")
      .eq("id", messageId)
      .single();

    if (msgErr || !msg) {
      return res.status(404).json({ error: "Message not found" });
    }

    // Fetch query details to check permissions
    const { data: query } = await supabase
      .from("support_queries")
      .select("*")
      .eq("id", msg.query_id)
      .single();

    if (!query) {
      return res.status(404).json({ error: "Query context not found" });
    }

    const projectCreatorId = await getProjectCreatorId(query.document_id);

    // Permission check: only the sender of the message, project creator, or admin can delete it
    const isSender = msg.sender_id === userId;
    const isCreator = projectCreatorId === userId;
    const isSystemAdmin = req.profile.role === "admin";

    if (!isSender && !isCreator && !isSystemAdmin) {
      return res.status(403).json({ error: "You are not authorized to delete this message." });
    }

    // Delete message
    const { error: deleteErr } = await supabase
      .from("support_messages")
      .delete()
      .eq("id", messageId);

    if (deleteErr) throw deleteErr;

    // Fetch the new last message for the query
    const { data: lastMsgs } = await supabase
      .from("support_messages")
      .select("*")
      .eq("query_id", query.id)
      .order("created_at", { ascending: false })
      .limit(1);

    const newLastMessage = lastMsgs && lastMsgs.length > 0 ? lastMsgs[0] : null;

    // Notify other clients via socket
    const io = getIo();
    if (io) {
      const recipientId = query.linguist_id === userId ? projectCreatorId : query.linguist_id;
      
      io.to(`document_chat:${query.document_id}`).emit("support:message-deleted", {
        queryId: query.id,
        messageId,
        lastMessage: newLastMessage
      });

      io.to(`user:${recipientId}`).emit("support:message-deleted", {
        queryId: query.id,
        messageId,
        lastMessage: newLastMessage
      });
    }

    res.json({ success: true, messageId, lastMessage: newLastMessage });
  } catch (err) {
    console.error("DELETE message error:", err);
    res.status(500).json({ error: "Failed to delete message" });
  }
});

// ─── PUT /messages/:messageId ─────────────────────────────────
// Edit a chat message
chatRouter.put("/messages/:messageId", async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Content is required" });
    }

    // Fetch message
    const { data: msg, error: msgErr } = await supabase
      .from("support_messages")
      .select("*")
      .eq("id", messageId)
      .single();

    if (msgErr || !msg) {
      return res.status(404).json({ error: "Message not found" });
    }

    // Fetch query details
    const { data: query } = await supabase
      .from("support_queries")
      .select("*")
      .eq("id", msg.query_id)
      .single();

    if (!query) {
      return res.status(404).json({ error: "Query context not found" });
    }

    // Only message sender can edit their own message
    if (msg.sender_id !== userId) {
      return res.status(403).json({ error: "You can only edit your own messages." });
    }

    // Edit message in DB
    const { data: updatedMsg, error: updateErr } = await supabase
      .from("support_messages")
      .update({
        content: content.trim(),
        updated_at: new Date().toISOString()
      })
      .eq("id", messageId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    const enriched = {
      ...updatedMsg,
      sender: mapProfile(req.profile)
    };

    // Emit to document room and user
    const io = getIo();
    if (io) {
      const projectCreatorId = await getProjectCreatorId(query.document_id);
      const recipientId = query.linguist_id === userId ? projectCreatorId : query.linguist_id;

      io.to(`document_chat:${query.document_id}`).emit("support:message-updated", enriched);
      io.to(`user:${recipientId}`).emit("support:message-updated", enriched);
    }

    res.json(enriched);
  } catch (err) {
    console.error("PUT message error:", err);
    res.status(500).json({ error: "Failed to edit message" });
  }
});

module.exports = {
  chatRouter
};
