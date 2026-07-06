const { getIo } = require("./socket");

const MAX_TPM = parseInt(process.env.OPENAI_MAX_TPM, 10) || 30000;
const MAX_RPM = parseInt(process.env.OPENAI_MAX_RPM, 10) || 500;

// Log of executed requests in sliding 60-second window
// Entry: { timestamp: Number, tokens: Number, type: String }
const executionLog = [];

// Queue of pending requests
const queue = [];

let isProcessing = false;

// Clean up entries older than 60 seconds
function cleanExecutionLog() {
  const cutoff = Date.now() - 60000;
  while (executionLog.length > 0 && executionLog[0].timestamp < cutoff) {
    executionLog.shift();
  }
}

// Get current RPM and TPM in the last 60 seconds
function getCurrentUsage() {
  cleanExecutionLog();
  let rpm = executionLog.length;
  let tpm = 0;
  for (const entry of executionLog) {
    tpm += entry.tokens;
  }
  return { rpm, tpm };
}

// Broadcast queue updates to users via sockets
function broadcastQueuePositions() {
  try {
    const io = getIo();
    if (!io) return;

    // Group tasks by userId
    const userTasks = {};
    queue.forEach((task, index) => {
      if (task.userId) {
        if (!userTasks[task.userId]) {
          userTasks[task.userId] = [];
        }
        userTasks[task.userId].push(index + 1); // 1-indexed position
      }
    });

    // Send position updates to each user's room
    for (const userId of Object.keys(userTasks)) {
      const position = userTasks[userId][0]; // position of their first task in queue
      io.to(`user:${userId}`).emit("translation-queue-update", { position });
    }
  } catch (err) {
    console.error("[QueueManager] Error broadcasting queue positions:", err);
  }
}

// The main processing loop
async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    while (queue.length > 0) {
      const task = queue[0];
      const { rpm, tpm } = getCurrentUsage();

      if (rpm + 1 > MAX_RPM || tpm + task.estimatedTokens > MAX_TPM) {
        // We are rate-limited. Sleep and check again.
        // Wait until the oldest log entry falls outside the 60-second window.
        let delay = 1000;
        if (executionLog.length > 0) {
          const oldestTime = executionLog[0].timestamp;
          const timeSinceOldest = Date.now() - oldestTime;
          delay = Math.max(100, 60000 - timeSinceOldest + 100);
        }
        console.warn(`[QueueManager] Rate limit reached (Current RPM: ${rpm}/${MAX_RPM}, TPM: ${tpm}/${MAX_TPM}). Delaying next task of estimated ${task.estimatedTokens} tokens by ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // We have capacity! Remove task from queue and execute it.
      queue.shift();
      
      // Register in execution log
      executionLog.push({
        timestamp: Date.now(),
        tokens: task.estimatedTokens,
        type: task.type
      });

      // Broadcast updated positions to users
      broadcastQueuePositions();

      // Execute task asynchronously so we don't block the scheduler loop
      (async () => {
        try {
          const result = await task.execute();
          task.resolve(result);
        } catch (err) {
          task.reject(err);
        } finally {
          // If the user queue becomes empty, broadcast 0 position update
          const hasMore = queue.some(t => t.userId === task.userId);
          if (!hasMore) {
            clearUserTranslationQueue(task.userId);
          }
        }
      })();
    }
  } catch (err) {
    console.error("[QueueManager] Error in processQueue loop:", err);
  } finally {
    isProcessing = false;
  }
}

// Enqueue a task
function enqueue({ type, estimatedTokens, userId, execute }) {
  return new Promise((resolve, reject) => {
    const task = {
      id: Math.random().toString(36).substring(2, 9),
      type,
      estimatedTokens: estimatedTokens || 1000,
      userId,
      execute,
      resolve,
      reject,
      createdAt: Date.now()
    };

    queue.push(task);
    
    // Broadcast positions right away
    broadcastQueuePositions();

    // Trigger queue processing
    processQueue();
  });
}

// Clean up active translation queue position for a user when their queue becomes empty
function clearUserTranslationQueue(userId) {
  try {
    const io = getIo();
    if (io) {
      io.to(`user:${userId}`).emit("translation-queue-update", { position: 0 });
    }
  } catch (err) {
    console.error("[QueueManager] Error clearing user queue state:", err);
  }
}

module.exports = {
  enqueue,
  clearUserTranslationQueue,
  getCurrentUsage
};
