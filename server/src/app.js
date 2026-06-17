const express = require("express");
const cors = require("cors");
const { authRouter } = require("./routes/auth");
const { adminRouter } = require("./routes/admin");
const { apiRouter } = require("./routes/api");

const app = express();

app.use(cors());
app.use(
  express.json({
    limit: "50mb"
  })
);

// Mount authentication and administration routers
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);

// Mount API router under both `/` and `/api` so older clients
// expecting root paths (e.g. `/upload`) continue to work while
// newer clients can use `/api/*`.
app.use(["/", "/api"], apiRouter);

module.exports = {
  app
};
