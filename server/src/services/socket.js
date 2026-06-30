const { Server } = require("socket.io");
const { supabase } = require("../config/supabase");

let io = null;

// Track active users and segment locks in memory for high-performance and auto-cleanup
const activeUsers = new Map(); // Map<documentId, Map<socketId, userInfo>>
const documentLocks = new Map(); // Map<documentId, Map<segmentIndex, lockInfo>>

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // Authentication Middleware for WebSocket Connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(" ")[1];
      if (!token) {
        return next(new Error("Authentication error: Missing token"));
      }

      // Verify token with Supabase Auth
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return next(new Error("Authentication error: Invalid or expired session"));
      }

      // Fetch user profile info
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileError || !profile) {
        return next(new Error("Authentication error: Profile not found"));
      }

      if (profile.status === "suspended") {
        return next(new Error("Authentication error: Account suspended"));
      }

      socket.user = user;
      socket.profile = profile;
      next();
    } catch (err) {
      console.error("Socket Auth Error:", err);
      next(new Error("Internal server error"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`User connected to workspace socket: ${socket.user.email} (${socket.id})`);

    // Join personal user room for direct user-targeted notifications
    socket.join(`user:${socket.user.id}`);

    // Join staff group room if they are staff
    const isStaff = ["admin", "verbolabs_staff"].includes(socket.profile.role);
    if (isStaff) {
      socket.join("verbolabs_staff");
    }

    // Handle joining a document room
    socket.on("join-document", async ({ documentId }) => {
      try {
        if (!documentId) return;

        // Verify document permissions
        const isStaff = ["admin", "verbolabs_staff"].includes(socket.profile.role);
        const { data: doc, error: docError } = await supabase
          .from("documents")
          .select("owner_id")
          .eq("id", documentId)
          .single();

        if (docError || !doc) {
          return socket.emit("error", { message: "Document not found" });
        }

        let hasAccess = isStaff || doc.owner_id === socket.user.id;
        if (!hasAccess) {
          const { data: access } = await supabase
            .from("document_access")
            .select("permission")
            .eq("document_id", documentId)
            .eq("user_id", socket.user.id)
            .single();
          if (access) {
            hasAccess = true;
          }
        }

        if (!hasAccess) {
          return socket.emit("error", { message: "Access denied to this document" });
        }

        // Join socket room
        socket.join(documentId);
        socket.currentDocId = documentId;

        // Register in active users
        if (!activeUsers.has(documentId)) {
          activeUsers.set(documentId, new Map());
        }
        const roomUsers = activeUsers.get(documentId);
        roomUsers.set(socket.id, {
          socketId: socket.id,
          userId: socket.user.id,
          email: socket.user.email,
          name: socket.profile.full_name || socket.user.email.split("@")[0],
          role: socket.profile.role,
          activeSegmentIndex: null
        });

        // Initialize locks map if missing
        if (!documentLocks.has(documentId)) {
          documentLocks.set(documentId, new Map());
        }
        const roomLocks = documentLocks.get(documentId);

        // Send current room state (users and locks) to the newly joined client
        socket.emit("room-state", {
          users: Array.from(roomUsers.values()),
          locks: Array.from(roomLocks.entries())
        });

        // Broadcast presence sync to all others in the room
        socket.to(documentId).emit("presence-update", Array.from(roomUsers.values()));
      } catch (err) {
        console.error("Socket join-document error:", err);
        socket.emit("error", { message: "Failed to load document room" });
      }
    });

    // Acquire lock on a translation segment cell
    socket.on("acquire-lock", ({ segmentIndex }) => {
      const documentId = socket.currentDocId;
      if (!documentId || segmentIndex === undefined || segmentIndex === null) return;

      const roomLocks = documentLocks.get(documentId);
      if (!roomLocks) return;

      const existingLock = roomLocks.get(segmentIndex);
      if (existingLock && existingLock.socketId !== socket.id) {
        return socket.emit("lock-failed", { segmentIndex, message: "This cell is already being edited" });
      }

      // Auto-release any previous locks held by this same socket session immediately
      for (const [idx, lock] of roomLocks.entries()) {
        if (lock.socketId === socket.id && idx !== segmentIndex) {
          roomLocks.delete(idx);
        }
      }

      // Store cell lock details
      const lockInfo = {
        socketId: socket.id,
        userId: socket.user.id,
        email: socket.user.email,
        name: socket.profile.full_name || socket.user.email.split("@")[0]
      };
      roomLocks.set(segmentIndex, lockInfo);

      // Update active user state to reflect focus
      const roomUsers = activeUsers.get(documentId);
      if (roomUsers && roomUsers.has(socket.id)) {
        roomUsers.get(socket.id).activeSegmentIndex = segmentIndex;
        io.to(documentId).emit("presence-update", Array.from(roomUsers.values()));
      }

      // Broadcast cell lock update
      io.to(documentId).emit("lock-update", Array.from(roomLocks.entries()));
    });

    // Release lock on a translation segment cell
    socket.on("release-lock", ({ segmentIndex }) => {
      const documentId = socket.currentDocId;
      if (!documentId || segmentIndex === undefined || segmentIndex === null) return;

      const roomLocks = documentLocks.get(documentId);
      if (roomLocks) {
        const existingLock = roomLocks.get(segmentIndex);
        if (existingLock && existingLock.socketId === socket.id) {
          roomLocks.delete(segmentIndex);
          io.to(documentId).emit("lock-update", Array.from(roomLocks.entries()));
        }
      }

      // Reset active segment in presence status
      const roomUsers = activeUsers.get(documentId);
      if (roomUsers && roomUsers.has(socket.id)) {
        roomUsers.get(socket.id).activeSegmentIndex = null;
        io.to(documentId).emit("presence-update", Array.from(roomUsers.values()));
      }
    });

    // Handle real-time typing broadcast before saving
    socket.on("typing-update", ({ segmentIndex, targetText, originalTargetText, trackedBy }) => {
      const documentId = socket.currentDocId;
      if (!documentId) return;
      socket.to(documentId).emit("typing-update", {
        segmentIndex,
        targetText,
        originalTargetText,
        trackedBy,
        socketId: socket.id
      });
    });

    // Handle user disconnect (either tab close or internet drop)
    socket.on("disconnect", () => {
      console.log(`User disconnected from workspace socket: ${socket.id}`);
      const documentId = socket.currentDocId;
      if (!documentId) return;

      // 1. Remove from presence users
      const roomUsers = activeUsers.get(documentId);
      if (roomUsers) {
        roomUsers.delete(socket.id);
        if (roomUsers.size === 0) {
          activeUsers.delete(documentId);
        } else {
          io.to(documentId).emit("presence-update", Array.from(roomUsers.values()));
        }
      }

      // 2. Auto-release all locks held by this socket session immediately
      const roomLocks = documentLocks.get(documentId);
      if (roomLocks) {
        let changed = false;
        for (const [segmentIndex, lockInfo] of roomLocks.entries()) {
          if (lockInfo.socketId === socket.id) {
            roomLocks.delete(segmentIndex);
            changed = true;
          }
        }
        if (changed) {
          if (roomLocks.size === 0) {
            documentLocks.delete(documentId);
            io.to(documentId).emit("lock-update", []);
          } else {
            io.to(documentId).emit("lock-update", Array.from(roomLocks.entries()));
          }
        }
      }
    });
  });
}

function getIo() {
  return io;
}

module.exports = {
  initSocket,
  getIo
};
