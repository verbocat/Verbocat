const { app } = require("../src/app");
const http = require("http");
const axios = require("axios");

async function test() {
  const server = http.createServer(app);
  server.listen(5999, async () => {
    console.log("Test server running on port 5999");
    try {
      // Make request to /api/chat/queries
      const res = await axios.get("http://localhost:5999/api/chat/queries");
      console.log("Response status:", res.status);
    } catch (err) {
      console.log("Error status:", err.response?.status);
      console.log("Error data:", err.response?.data);
    } finally {
      server.close();
    }
  });
}

test();
