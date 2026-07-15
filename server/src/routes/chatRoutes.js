const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { supabase } = require("../config/supabase");
const { checkAuth } = require("../utils/authMiddleware");
const { getIo } = require("../services/socket");

const chatRouter = express.Router();

// Ensure uploads/chat directory exists
const uploadDir = path.join(__dirname, "../../uploads/chat");
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

// ─── Helper: check if user is admin or staff ──────────────────
const isStaff = (profile) => ["admin", "verbolabs_staff"].includes(profile.role);

// ─── Helper: map profile to standard and user-prefixed properties for frontend compatibility ───
const mapProfile = (p) => {
  if (!p) return null;
  const name = p.email ? p.email.split("@")[0] : "Linguist";
  return {
    id: p.id,
    user_id: p.id,
    email: p.email,
    user_email: p.email,
    role: p.role,
    user_role: p.role,
    name: name,
    full_name: name,
    user_name: name,
    status: p.status
  };
};

const mapMessage = (m) => {
  if (!m) return null;
  return {
    ...m,
    file_url: m.attachment_url,
    file_type: m.attachment_type,
    file_name: m.attachment_name,
    reply_to_id: m.reply_to,
    is_edited: m.is_edited || false,
    is_pinned: m.is_pinned || false,
    thread_parent_id: m.thread_parent_id || null
  };
};


// ─── GET /conversations ───────────────────────────────────────
// List user's conversations with last message and unread count
chatRouter.get("/conversations", async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all conversation IDs user participates in
    const { data: participations, error: partError } = await supabase
      .from("chat_participants")
      .select("conversation_id")
      .eq("user_id", userId);

    if (partError) throw partError;
    if (!participations || participations.length === 0) {
      return res.json([]);
    }

    const convIds = participations.map(p => p.conversation_id);

    // Fetch conversations
    const { data: conversations, error: convError } = await supabase
      .from("chat_conversations")
      .select("*")
      .in("id", convIds)
      .order("updated_at", { ascending: false });

    if (convError) throw convError;

    // For each conversation, get: participants, last message, unread count
    const enriched = await Promise.all(conversations.map(async (conv) => {
      // Get participants with profiles
      const { data: participants } = await supabase
        .from("chat_participants")
        .select("user_id, role")
        .eq("conversation_id", conv.id);

      const participantIds = participants ? participants.map(p => p.user_id) : [];

      // Get participant profiles
      const { data: rawProfiles } = await supabase
        .from("profiles")
        .select("id, email, role, status")
        .in("id", participantIds);

      const profiles = (rawProfiles || []).map(mapProfile);

      // Get last message
      const { data: lastMessages } = await supabase
        .from("chat_messages")
        .select("id, content, attachment_type, attachment_name, attachment_url, is_unsent, created_at, sender_id")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(1);

      const lastMessage = lastMessages && lastMessages.length > 0 ? mapMessage(lastMessages[0]) : null;

      // Get read receipt for this user
      const { data: receipt } = await supabase
        .from("chat_read_receipts")
        .select("last_read_at")
        .eq("conversation_id", conv.id)
        .eq("user_id", userId)
        .single();

      // Count unread messages
      let unreadCount = 0;
      if (receipt && receipt.last_read_at) {
        const { count } = await supabase
          .from("chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conv.id)
          .neq("sender_id", userId)
          .gt("created_at", receipt.last_read_at);
        unreadCount = count || 0;
      } else {
        const { count } = await supabase
          .from("chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conv.id)
          .neq("sender_id", userId);
        unreadCount = count || 0;
      }

      // For direct conversations, find the other user
      let otherUser = null;
      if (conv.type === "direct" && profiles) {
        otherUser = profiles.find(p => p.id !== userId) || null;
      }

      return {
        ...conv,
        participants: profiles || [],
        participantCount: participantIds.length,
        lastMessage,
        last_message: lastMessage,
        unreadCount,
        otherUser
      };
    }));

    res.json(enriched);
  } catch (err) {
    console.error("GET /chat/conversations error:", err);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

// ─── POST /conversations ──────────────────────────────────────
// Create a new direct or group conversation
chatRouter.post("/conversations", async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, participantIds, name } = req.body;

    if (!type || !participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
      return res.status(400).json({ error: "type and participantIds are required" });
    }

    if (type === "direct") {
      if (participantIds.length !== 1) {
        return res.status(400).json({ error: "Direct conversations require exactly one other participant" });
      }

      const otherUserId = participantIds[0];

      // Check permission: linguists cannot chat with other linguists
      if (req.profile.role === "linguist") {
        const { data: otherProfile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", otherUserId)
          .single();

        if (otherProfile && otherProfile.role === "linguist") {
          return res.status(403).json({ error: "Linguists can only chat with Admin or VerboLabs Staff" });
        }
      }

      // Check if direct conversation already exists between these two users
      const { data: myConvs } = await supabase
        .from("chat_participants")
        .select("conversation_id")
        .eq("user_id", userId);

      const { data: theirConvs } = await supabase
        .from("chat_participants")
        .select("conversation_id")
        .eq("user_id", otherUserId);

      if (myConvs && theirConvs) {
        const myIds = new Set(myConvs.map(c => c.conversation_id));
        const commonIds = theirConvs
          .map(c => c.conversation_id)
          .filter(id => myIds.has(id));

        for (const convId of commonIds) {
          const { data: conv } = await supabase
            .from("chat_conversations")
            .select("*")
            .eq("id", convId)
            .eq("type", "direct")
            .single();

          if (conv) {
            // Return existing conversation
            const { data: participants } = await supabase
              .from("chat_participants")
              .select("user_id, role")
              .eq("conversation_id", conv.id);

            const pIds = participants ? participants.map(p => p.user_id) : [];
            const { data: rawProfiles } = await supabase
              .from("profiles")
              .select("id, email, role, status")
              .in("id", pIds);

            const profiles = (rawProfiles || []).map(mapProfile);

            const otherUser = profiles ? profiles.find(p => p.id !== userId) : null;

            return res.json({
              ...conv,
              participants: profiles || [],
              participantCount: pIds.length,
              otherUser,
              lastMessage: null,
              unreadCount: 0,
              existing: true
            });
          }
        }
      }

      // Create new direct conversation
      const { data: newConv, error: convError } = await supabase
        .from("chat_conversations")
        .insert({ type: "direct", created_by: userId })
        .select()
        .single();

      if (convError) throw convError;

      // Add both participants
      const { error: partError } = await supabase
        .from("chat_participants")
        .insert([
          { conversation_id: newConv.id, user_id: userId, role: "admin" },
          { conversation_id: newConv.id, user_id: otherUserId, role: "member" }
        ]);

      if (partError) throw partError;

      // Get profiles for response
      const { data: rawProfiles } = await supabase
        .from("profiles")
        .select("id, email, role, status")
        .in("id", [userId, otherUserId]);

      const profiles = (rawProfiles || []).map(mapProfile);

      const otherUser = profiles ? profiles.find(p => p.id !== userId) : null;

      const result = {
        ...newConv,
        participants: profiles || [],
        participantCount: 2,
        otherUser,
        lastMessage: null,
        unreadCount: 0,
        existing: false
      };

      // Notify the other user via socket
      const io = getIo();
      if (io) {
        io.to(`user:${otherUserId}`).emit("chat:new-conversation", result);
      }

      return res.json(result);
    }

    if (type === "group") {
      // Only admin/staff can create groups
      if (!isStaff(req.profile)) {
        return res.status(403).json({ error: "Only Admin and VerboLabs Staff can create group conversations" });
      }

      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Group name is required" });
      }

      // Create group conversation
      const { data: newConv, error: convError } = await supabase
        .from("chat_conversations")
        .insert({ type: "group", name: name.trim(), created_by: userId })
        .select()
        .single();

      if (convError) throw convError;

      // Add creator + participants
      const allParticipants = [userId, ...participantIds.filter(id => id !== userId)];
      const participantRows = allParticipants.map(uid => ({
        conversation_id: newConv.id,
        user_id: uid,
        role: uid === userId ? "admin" : "member"
      }));

      const { error: partError } = await supabase
        .from("chat_participants")
        .insert(participantRows);

      if (partError) throw partError;

      // Get profiles
      const { data: rawProfiles } = await supabase
        .from("profiles")
        .select("id, email, role, status")
        .in("id", allParticipants);

      const profiles = (rawProfiles || []).map(mapProfile);

      const result = {
        ...newConv,
        participants: profiles || [],
        participantCount: allParticipants.length,
        otherUser: null,
        lastMessage: null,
        unreadCount: 0,
        existing: false
      };

      // Notify all participants via socket
      const io = getIo();
      if (io) {
        participantIds.forEach(pid => {
          if (pid !== userId) {
            io.to(`user:${pid}`).emit("chat:new-conversation", result);
          }
        });
      }

      return res.json(result);
    }

    res.status(400).json({ error: "Invalid conversation type" });
  } catch (err) {
    console.error("POST /chat/conversations error:", err);
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

// ─── GET /conversations/:id/messages ──────────────────────────
// Paginated messages with sender info
chatRouter.get("/conversations/:id/messages", async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;
    const cursor = req.query.cursor;
    const limit = parseInt(req.query.limit) || 50;

    // Verify user is a participant
    const { data: membership } = await supabase
      .from("chat_participants")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .single();

    if (!membership) {
      return res.status(403).json({ error: "You are not a participant of this conversation" });
    }

    // Build query
    let query = supabase
      .from("chat_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .is("thread_parent_id", null) // Filter out thread replies!
      .order("created_at", { ascending: false })
      .limit(limit);

    if (cursor) {
      // Get the cursor message's created_at
      const { data: cursorMsg } = await supabase
        .from("chat_messages")
        .select("created_at")
        .eq("id", cursor)
        .single();

      if (cursorMsg) {
        query = query.lt("created_at", cursorMsg.created_at);
      }
    }

    const { data: messages, error: msgError } = await query;
    if (msgError) throw msgError;

    if (!messages || messages.length === 0) {
      return res.json({ messages: [], hasMore: false });
    }

    const messageIds = messages.map(m => m.id);

    // Fetch reactions for these messages
    let reactionsMap = {};
    if (messageIds.length > 0) {
      const { data: rawReactions } = await supabase
        .from("chat_message_reactions")
        .select("id, message_id, user_id, emoji, created_at")
        .in("message_id", messageIds);

      if (rawReactions) {
        rawReactions.forEach(r => {
          if (!reactionsMap[r.message_id]) {
            reactionsMap[r.message_id] = [];
          }
          reactionsMap[r.message_id].push(r);
        });
      }
    }

    // Fetch thread reply counts for these messages
    let replyCounts = {};
    if (messageIds.length > 0) {
      const { data: threadCounts } = await supabase
        .from("chat_messages")
        .select("thread_parent_id")
        .in("thread_parent_id", messageIds);

      if (threadCounts) {
        threadCounts.forEach(t => {
          if (t.thread_parent_id) {
            replyCounts[t.thread_parent_id] = (replyCounts[t.thread_parent_id] || 0) + 1;
          }
        });
      }
    }

    // Get unique sender IDs
    const senderIds = [...new Set(messages.map(m => m.sender_id))];
    const { data: rawProfiles } = await supabase
      .from("profiles")
      .select("id, email, role")
      .in("id", senderIds);

    const profiles = (rawProfiles || []).map(mapProfile);

    const profileMap = {};
    if (profiles) {
      profiles.forEach(p => { profileMap[p.id] = p; });
    }

    // Get reply-to messages if any
    const replyIds = messages.filter(m => m.reply_to).map(m => m.reply_to);
    let replyMap = {};
    if (replyIds.length > 0) {
      const { data: replyMsgs } = await supabase
        .from("chat_messages")
        .select("id, content, sender_id, is_unsent, attachment_type, attachment_url, attachment_name")
        .in("id", replyIds);

      if (replyMsgs) {
        replyMsgs.forEach(m => {
          const senderProfile = profileMap[m.sender_id];
          replyMap[m.id] = {
            ...mapMessage(m),
            sender_name: senderProfile ? (senderProfile.full_name || senderProfile.email.split("@")[0]) : "Unknown",
            sender_email: senderProfile ? senderProfile.email : "Unknown"
          };
        });
      }
    }

    // Enrich messages with sender info, reply data, reactions, and reply counts
    const enriched = messages.map(m => {
      const senderProfile = profileMap[m.sender_id] || mapProfile({ id: m.sender_id, email: "Unknown", role: "linguist" });
      const replyMsg = m.reply_to ? (replyMap[m.reply_to] || null) : null;
      return {
        ...mapMessage(m),
        sender: senderProfile,
        sender_name: senderProfile.full_name || senderProfile.user_name || "Unknown",
        sender_email: senderProfile.email || senderProfile.user_email || "Unknown",
        sender_role: senderProfile.role || senderProfile.user_role || "linguist",
        reactions: reactionsMap[m.id] || [],
        reply_count: replyCounts[m.id] || 0,
        replyToMessage: replyMsg ? {
          ...replyMsg,
          sender_name: replyMsg.sender_name || replyMsg.senderName || "Unknown",
          sender_email: replyMsg.sender_email || "Unknown"
        } : null
      };
    });


    // Reverse to oldest-first for display
    enriched.reverse();

    res.json({
      messages: enriched,
      hasMore: messages.length === limit
    });
  } catch (err) {
    console.error("GET /chat/conversations/:id/messages error:", err);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// ─── POST /conversations/:id/messages ─────────────────────────
// Send a text message
chatRouter.post("/conversations/:id/messages", async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;
    const { content, replyTo, threadParentId } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Message content is required" });
    }

    // Verify participation
    const { data: membership } = await supabase
      .from("chat_participants")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .single();

    if (!membership) {
      return res.status(403).json({ error: "You are not a participant of this conversation" });
    }

    // Insert message
    const messageData = {
      conversation_id: conversationId,
      sender_id: userId,
      content: content.trim()
    };
    if (replyTo) messageData.reply_to = replyTo;
    if (threadParentId) messageData.thread_parent_id = threadParentId;

    const { data: message, error: msgError } = await supabase
      .from("chat_messages")
      .insert(messageData)
      .select()
      .single();

    if (msgError) throw msgError;

    // Update conversation timestamp
    await supabase
      .from("chat_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    // Get sender profile
    const senderProfile = mapProfile(req.profile);

    // Get reply-to message if present
    let replyToMessage = null;
    if (replyTo) {
      const { data: replyMsg } = await supabase
        .from("chat_messages")
        .select("id, content, sender_id, is_unsent, attachment_type, attachment_url, attachment_name")
        .eq("id", replyTo)
        .single();

      if (replyMsg) {
        const { data: replySender } = await supabase
          .from("profiles")
          .select("email")
          .eq("id", replyMsg.sender_id)
          .single();

        const replySenderProfile = replySender ? mapProfile(replySender) : null;
        replyToMessage = {
          ...mapMessage(replyMsg),
          senderName: replySenderProfile ? replySenderProfile.full_name : "Unknown",
          sender_name: replySenderProfile ? replySenderProfile.full_name : "Unknown",
          sender_email: replySenderProfile ? replySenderProfile.email : "Unknown"
        };
      }
    }

    const enrichedMessage = {
      ...mapMessage(message),
      sender: senderProfile,
      sender_name: senderProfile.full_name || senderProfile.user_name || "Unknown",
      sender_email: senderProfile.email || senderProfile.user_email || "Unknown",
      sender_role: senderProfile.role || senderProfile.user_role || "linguist",
      reactions: [],
      reply_count: 0,
      replyToMessage
    };

    // Emit to conversation room
    const io = getIo();
    if (io) {
      io.to(`chat:${conversationId}`).emit("chat:new-message", enrichedMessage);
    }

    res.json(enrichedMessage);
  } catch (err) {
    console.error("POST /chat/conversations/:id/messages error:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// ─── POST /conversations/:id/upload ───────────────────────────
// Upload image/file as a chat message
chatRouter.post("/conversations/:id/upload", upload.single("file"), async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Verify participation
    const { data: membership } = await supabase
      .from("chat_participants")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .single();

    if (!membership) {
      return res.status(403).json({ error: "You are not a participant of this conversation" });
    }

    // Determine attachment type
    const isImage = req.file.mimetype.startsWith("image/");
    const attachmentType = isImage ? "image" : "file";
    const attachmentUrl = `/uploads/chat/${req.file.filename}`;

    // Insert message with attachment
    const messageData = {
      conversation_id: conversationId,
      sender_id: userId,
      content: req.body.content || null,
      attachment_url: attachmentUrl,
      attachment_type: attachmentType,
      attachment_name: req.file.originalname
    };
    if (req.body.replyTo) messageData.reply_to = req.body.replyTo;
    if (req.body.threadParentId) messageData.thread_parent_id = req.body.threadParentId;

    const { data: message, error: msgError } = await supabase
      .from("chat_messages")
      .insert(messageData)
      .select()
      .single();

    if (msgError) throw msgError;

    // Update conversation timestamp
    await supabase
      .from("chat_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    const senderProfile = mapProfile(req.profile);

    const enrichedMessage = {
      ...mapMessage(message),
      sender: senderProfile,
      sender_name: senderProfile.full_name || senderProfile.user_name || "Unknown",
      sender_email: senderProfile.email || senderProfile.user_email || "Unknown",
      sender_role: senderProfile.role || senderProfile.user_role || "linguist",
      reactions: [],
      reply_count: 0,
      replyToMessage: null
    };

    // Emit to conversation room
    const io = getIo();
    if (io) {
      io.to(`chat:${conversationId}`).emit("chat:new-message", enrichedMessage);
    }

    res.json(enrichedMessage);
  } catch (err) {
    console.error("POST /chat/conversations/:id/upload error:", err);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

// ─── PUT /messages/:id/unsend ─────────────────────────────────
// Soft-delete a message (own messages only)
chatRouter.put("/messages/:id/unsend", async (req, res) => {
  try {
    const userId = req.user.id;
    const messageId = req.params.id;

    // Get the message
    const { data: message, error: msgError } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("id", messageId)
      .single();

    if (msgError || !message) {
      return res.status(404).json({ error: "Message not found" });
    }

    // Only sender can unsend
    if (message.sender_id !== userId) {
      return res.status(403).json({ error: "You can only unsend your own messages" });
    }

    // Soft delete
    const { error: updateError } = await supabase
      .from("chat_messages")
      .update({
        is_unsent: true,
        content: null,
        attachment_url: null,
        attachment_type: null,
        attachment_name: null
      })
      .eq("id", messageId);

    if (updateError) throw updateError;

    // Emit to conversation room
    const io = getIo();
    if (io) {
      io.to(`chat:${message.conversation_id}`).emit("chat:message-unsent", {
        messageId,
        conversationId: message.conversation_id
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("PUT /chat/messages/:id/unsend error:", err);
    res.status(500).json({ error: "Failed to unsend message" });
  }
});

// ─── PUT /conversations/:id/read ──────────────────────────────
// Mark conversation as read
chatRouter.put("/conversations/:id/read", async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;

    // Upsert read receipt
    const { data: existing } = await supabase
      .from("chat_read_receipts")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .single();

    if (existing) {
      await supabase
        .from("chat_read_receipts")
        .update({ last_read_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("chat_read_receipts")
        .insert({
          conversation_id: conversationId,
          user_id: userId,
          last_read_at: new Date().toISOString()
        });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("PUT /chat/conversations/:id/read error:", err);
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

// ─── GET /users ───────────────────────────────────────────────
// Search users available for chat
chatRouter.get("/users", async (req, res) => {
  try {
    const userId = req.user.id;
    const search = req.query.search || "";

    let query = supabase
      .from("profiles")
      .select("id, email, role, status")
      .neq("id", userId)
      .neq("status", "suspended")
      .order("email", { ascending: true })
      .limit(20);

    // Linguists can only see admin and staff
    if (req.profile.role === "linguist") {
      query = query.in("role", ["admin", "verbolabs_staff"]);
    }

    if (search.trim()) {
      query = query.ilike("email", `%${search}%`);
    }

    const { data: users, error } = await query;
    if (error) throw error;

    const mappedUsers = (users || []).map(mapProfile);

    res.json(mappedUsers);
  } catch (err) {
    console.error("GET /chat/users error:", err);
    res.status(500).json({ error: "Failed to search users" });
  }
});

// ─── PUT /conversations/:id ───────────────────────────────────
// Update group name (admin/staff only)
chatRouter.put("/conversations/:id", async (req, res) => {
  try {
    if (!isStaff(req.profile)) {
      return res.status(403).json({ error: "Only Admin and Staff can update groups" });
    }

    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Group name is required" });
    }

    const { data, error } = await supabase
      .from("chat_conversations")
      .update({ name: name.trim() })
      .eq("id", req.params.id)
      .eq("type", "group")
      .select()
      .single();

    if (error) throw error;

    // Notify all participants via socket
    const io = getIo();
    if (io) {
      io.to(`chat:${req.params.id}`).emit("chat:group-updated", data);
    }

    res.json(data);
  } catch (err) {
    console.error("PUT /chat/conversations/:id error:", err);
    res.status(500).json({ error: "Failed to update group" });
  }
});

// ─── POST /conversations/:id/participants ─────────────────────
// Add participants to a group (admin/staff only)
chatRouter.post("/conversations/:id/participants", async (req, res) => {
  try {
    if (!isStaff(req.profile)) {
      return res.status(403).json({ error: "Only Admin and Staff can add participants" });
    }

    const conversationId = req.params.id;
    const { userIds } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: "userIds array is required" });
    }

    // Verify it's a group conversation
    const { data: conv } = await supabase
      .from("chat_conversations")
      .select("type")
      .eq("id", conversationId)
      .single();

    if (!conv || conv.type !== "group") {
      return res.status(400).json({ error: "Can only add participants to group conversations" });
    }

    // Add participants (ignore duplicates)
    const rows = userIds.map(uid => ({
      conversation_id: conversationId,
      user_id: uid,
      role: "member"
    }));

    const { error } = await supabase
      .from("chat_participants")
      .upsert(rows, { onConflict: "conversation_id,user_id", ignoreDuplicates: true });

    if (error) throw error;

    // Notify added users via socket
    const io = getIo();
    if (io) {
      // Get updated conversation for notification
      const { data: updatedConv } = await supabase
        .from("chat_conversations")
        .select("*")
        .eq("id", conversationId)
        .single();

      userIds.forEach(uid => {
        io.to(`user:${uid}`).emit("chat:new-conversation", updatedConv);
      });

      // Broadcast participant update to the conversation room
      io.to(`chat:${conversationId}`).emit("chat:participants-updated", { conversationId });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("POST /chat/conversations/:id/participants error:", err);
    res.status(500).json({ error: "Failed to add participants" });
  }
});

// ─── DELETE /conversations/:id/participants/:userId ───────────
// Remove a participant from a group (admin/staff only)
chatRouter.delete("/conversations/:id/participants/:userId", async (req, res) => {
  try {
    if (!isStaff(req.profile)) {
      return res.status(403).json({ error: "Only Admin and Staff can remove participants" });
    }

    const { error } = await supabase
      .from("chat_participants")
      .delete()
      .eq("conversation_id", req.params.id)
      .eq("user_id", req.params.userId);

    if (error) throw error;

    // Notify removed user
    const io = getIo();
    if (io) {
      io.to(`user:${req.params.userId}`).emit("chat:participant-removed", {
        conversationId: req.params.id
      });
      // Broadcast participant update to the conversation room
      io.to(`chat:${req.params.id}`).emit("chat:participants-updated", { conversationId: req.params.id });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /chat/conversations/:id/participants/:userId error:", err);
    res.status(500).json({ error: "Failed to remove participant" });
  }
});

// ─── DELETE /conversations/:id/leave ──────────────────────────
// Leave a group conversation
chatRouter.delete("/conversations/:id/leave", async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;

    const { error } = await supabase
      .from("chat_participants")
      .delete()
      .eq("conversation_id", conversationId)
      .eq("user_id", userId);

    if (error) throw error;

    // Check if conversation is now empty
    const { count } = await supabase
      .from("chat_participants")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);

    if (count === 0) {
      // Delete the conversation and all its messages
      await supabase.from("chat_conversations").delete().eq("id", conversationId);
    } else {
      // Notify remaining group members
      const io = getIo();
      if (io) {
        io.to(`chat:${conversationId}`).emit("chat:participants-updated", { conversationId });
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /chat/conversations/:id/leave error:", err);
    res.status(500).json({ error: "Failed to leave conversation" });
  }
});

// ─── PUT /messages/:id ────────────────────────────────────────
// Edit message content (own messages only)
chatRouter.put("/messages/:id", async (req, res) => {
  try {
    const userId = req.user.id;
    const messageId = req.params.id;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Content is required" });
    }

    const { data: message, error: fetchErr } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("id", messageId)
      .single();

    if (fetchErr || !message) {
      return res.status(404).json({ error: "Message not found" });
    }

    if (message.sender_id !== userId) {
      return res.status(403).json({ error: "You can only edit your own messages" });
    }

    if (message.is_unsent) {
      return res.status(400).json({ error: "Cannot edit an unsent message" });
    }

    const { data: updated, error: updateErr } = await supabase
      .from("chat_messages")
      .update({ content: content.trim(), is_edited: true })
      .eq("id", messageId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    const mapped = mapMessage(updated);

    // Notify conversation room
    const io = getIo();
    if (io) {
      io.to(`chat:${message.conversation_id}`).emit("chat:message-edited", mapped);
    }

    res.json(mapped);
  } catch (err) {
    console.error("PUT /chat/messages/:id error:", err);
    res.status(500).json({ error: "Failed to edit message" });
  }
});

// ─── PUT /messages/:id/pin ────────────────────────────────────
// Toggle pinned status of a message
chatRouter.put("/messages/:id/pin", async (req, res) => {
  try {
    const messageId = req.params.id;

    const { data: message, error: fetchErr } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("id", messageId)
      .single();

    if (fetchErr || !message) {
      return res.status(404).json({ error: "Message not found" });
    }

    const nextPin = !message.is_pinned;

    const { data: updated, error: updateErr } = await supabase
      .from("chat_messages")
      .update({ is_pinned: nextPin })
      .eq("id", messageId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    const mapped = mapMessage(updated);

    // Notify room
    const io = getIo();
    if (io) {
      io.to(`chat:${message.conversation_id}`).emit("chat:message-pinned", {
        messageId: message.id,
        conversationId: message.conversation_id,
        is_pinned: nextPin,
        message: mapped
      });
    }

    res.json(mapped);
  } catch (err) {
    console.error("PUT /chat/messages/:id/pin error:", err);
    res.status(500).json({ error: "Failed to toggle pin" });
  }
});

// ─── POST /messages/:id/reactions ──────────────────────────────
// Toggle reaction to a message
chatRouter.post("/messages/:id/reactions", async (req, res) => {
  try {
    const userId = req.user.id;
    const messageId = req.params.id;
    const { emoji } = req.body;

    if (!emoji || !emoji.trim()) {
      return res.status(400).json({ error: "Emoji is required" });
    }

    // Verify message exists
    const { data: message, error: msgErr } = await supabase
      .from("chat_messages")
      .select("conversation_id")
      .eq("id", messageId)
      .single();

    if (msgErr || !message) {
      return res.status(404).json({ error: "Message not found" });
    }

    // Check if user already reacted with this emoji
    const { data: existing } = await supabase
      .from("chat_message_reactions")
      .select("id")
      .eq("message_id", messageId)
      .eq("user_id", userId)
      .eq("emoji", emoji.trim())
      .single();

    if (existing) {
      // Remove reaction
      await supabase
        .from("chat_message_reactions")
        .delete()
        .eq("id", existing.id);
    } else {
      // Add reaction
      await supabase
        .from("chat_message_reactions")
        .insert({
          message_id: messageId,
          user_id: userId,
          emoji: emoji.trim()
        });
    }

    // Fetch all current reactions for this message to return
    const { data: reactions } = await supabase
      .from("chat_message_reactions")
      .select("id, message_id, user_id, emoji, created_at")
      .eq("message_id", messageId);

    const result = reactions || [];

    // Notify room
    const io = getIo();
    if (io) {
      io.to(`chat:${message.conversation_id}`).emit("chat:reaction-updated", {
        messageId,
        conversationId: message.conversation_id,
        reactions: result
      });
    }

    res.json(result);
  } catch (err) {
    console.error("POST /chat/messages/:id/reactions error:", err);
    res.status(500).json({ error: "Failed to toggle reaction" });
  }
});

// ─── POST /messages/:id/forward ───────────────────────────────
// Forward message to another conversation
chatRouter.post("/messages/:id/forward", async (req, res) => {
  try {
    const userId = req.user.id;
    const messageId = req.params.id;
    const { conversationId } = req.body;

    if (!conversationId) {
      return res.status(400).json({ error: "conversationId is required" });
    }

    // Verify participation in target conversation
    const { data: membership } = await supabase
      .from("chat_participants")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .single();

    if (!membership) {
      return res.status(403).json({ error: "You are not a participant of target conversation" });
    }

    // Get source message details
    const { data: srcMsg, error: fetchErr } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("id", messageId)
      .single();

    if (fetchErr || !srcMsg) {
      return res.status(404).json({ error: "Source message not found" });
    }

    // Insert new message in target conversation
    const messageData = {
      conversation_id: conversationId,
      sender_id: userId,
      content: srcMsg.content ? `[Forwarded]: ${srcMsg.content}` : "[Forwarded attachment]",
      attachment_url: srcMsg.attachment_url || null,
      attachment_type: srcMsg.attachment_type || null,
      attachment_name: srcMsg.attachment_name || null
    };

    const { data: message, error: insertErr } = await supabase
      .from("chat_messages")
      .insert(messageData)
      .select()
      .single();

    if (insertErr) throw insertErr;

    // Update conversation timestamp
    await supabase
      .from("chat_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    const senderProfile = mapProfile(req.profile);
    const enrichedMessage = {
      ...mapMessage(message),
      sender: senderProfile,
      sender_name: senderProfile.full_name || senderProfile.user_name || "Unknown",
      sender_email: senderProfile.email || senderProfile.user_email || "Unknown",
      sender_role: senderProfile.role || senderProfile.user_role || "linguist",
      reactions: [],
      reply_count: 0,
      replyToMessage: null
    };

    // Emit to conversation room
    const io = getIo();
    if (io) {
      io.to(`chat:${conversationId}`).emit("chat:new-message", enrichedMessage);
    }

    res.json(enrichedMessage);
  } catch (err) {
    console.error("POST /chat/messages/:id/forward error:", err);
    res.status(500).json({ error: "Failed to forward message" });
  }
});

// ─── GET /messages/:id/thread ─────────────────────────────────
// Fetch threaded replies for a message
chatRouter.get("/messages/:id/thread", async (req, res) => {
  try {
    const parentId = req.params.id;

    // Verify parent message exists
    const { data: parentMsg } = await supabase
      .from("chat_messages")
      .select("conversation_id")
      .eq("id", parentId)
      .single();

    if (!parentMsg) {
      return res.status(404).json({ error: "Thread parent message not found" });
    }

    // Verify user is member of conversation
    const { data: membership } = await supabase
      .from("chat_participants")
      .select("id")
      .eq("conversation_id", parentMsg.conversation_id)
      .eq("user_id", req.user.id)
      .single();

    if (!membership) {
      return res.status(403).json({ error: "You are not a participant of this conversation" });
    }

    // Fetch replies
    const { data: replies, error: threadErr } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("thread_parent_id", parentId)
      .order("created_at", { ascending: true });

    if (threadErr) throw threadErr;

    if (!replies || replies.length === 0) {
      return res.json([]);
    }

    const replyIds = replies.map(r => r.id);

    // Fetch reactions for thread replies
    let reactionsMap = {};
    if (replyIds.length > 0) {
      const { data: rawReactions } = await supabase
        .from("chat_message_reactions")
        .select("id, message_id, user_id, emoji, created_at")
        .in("message_id", replyIds);

      if (rawReactions) {
        rawReactions.forEach(r => {
          if (!reactionsMap[r.message_id]) {
            reactionsMap[r.message_id] = [];
          }
          reactionsMap[r.message_id].push(r);
        });
      }
    }

    // Fetch sender profiles
    const senderIds = [...new Set(replies.map(r => r.sender_id))];
    const { data: rawProfiles } = await supabase
      .from("profiles")
      .select("id, email, role")
      .in("id", senderIds);

    const profiles = (rawProfiles || []).map(mapProfile);
    const profileMap = {};
    if (profiles) {
      profiles.forEach(p => { profileMap[p.id] = p; });
    }

    // Map and enrich
    const enriched = replies.map(r => {
      const senderProfile = profileMap[r.sender_id] || mapProfile({ id: r.sender_id, email: "Unknown", role: "linguist" });
      return {
        ...mapMessage(r),
        sender: senderProfile,
        sender_name: senderProfile.full_name || senderProfile.user_name || "Unknown",
        sender_email: senderProfile.email || senderProfile.user_email || "Unknown",
        sender_role: senderProfile.role || senderProfile.user_role || "linguist",
        reactions: reactionsMap[r.id] || [],
        reply_count: 0
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error("GET /chat/messages/:id/thread error:", err);
    res.status(500).json({ error: "Failed to fetch thread replies" });
  }
});

module.exports = { chatRouter };
