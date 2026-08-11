require('regenerator-runtime/runtime');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const http = require("http");
const { app } = require("./src/app");
const { initSocket } = require("./src/services/socket");
const { startQueueWorker } = require("./src/services/jobQueue");

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
initSocket(server);

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[CRITICAL] Port ${PORT} is already in use by another node process!`);
    console.error(`Please close any existing Node processes running on port ${PORT}.`);
  } else {
    console.error("[CRITICAL] Server error:", err);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  // Updated HTML parser & sentence segmentation rules loaded
  console.log(`Server running on port ${PORT}`);
  // Start background translation queue worker
  // startQueueWorker();
});
