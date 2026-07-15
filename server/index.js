process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
require('regenerator-runtime/runtime');
require('dotenv').config();
const http = require("http");
const { app } = require("./src/app");
const { initSocket } = require("./src/services/socket");
const { startQueueWorker } = require("./src/services/jobQueue");

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
initSocket(server);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  // Start background translation queue worker
  // startQueueWorker();
});
