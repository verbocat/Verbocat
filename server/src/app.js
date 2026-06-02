const express = require("express");
const cors = require("cors");
const { apiRouter } = require("./routes/api");

const app = express();

app.use(cors());
app.use(
  express.json({
    limit: "50mb"
  })
);

// Mount API router under both `/` and `/api` so older clients
// expecting root paths (e.g. `/upload`) continue to work while
// newer clients can use `/api/*`.
app.use(["/", "/api"], apiRouter);

module.exports = {
  app
};
