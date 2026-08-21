const express = require("express");
const cors = require("cors");
const path = require("path");
const { authRouter } = require("./routes/auth");
const { adminRouter } = require("./routes/admin");
const { apiRouter } = require("./routes/api");
const { chatRouter } = require("./routes/chatRoutes");
const { vendorRouter } = require("./routes/vendorRoutes");

const { resolveTenant } = require("./utils/tenantMiddleware");

const app = express();

app.use(cors());
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
app.use(
  express.json({
    limit: "50mb"
  })
);

// Resolve organization space (tenant) for every request
app.use(resolveTenant);

// Mount authentication and administration routers
app.use("/api/auth", authRouter);
app.use("/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/admin", adminRouter);

// Mount chat router
app.use("/api/chat", chatRouter);

// Mount vendor portal router
app.use("/api/vendor", vendorRouter);

// Mount API router under both `/api` and `/` (in that order) so requests starting
// with `/api` have `/api` stripped properly before matching apiRouter.
app.use("/api", apiRouter);
app.use("/", apiRouter);

module.exports = {
  app
};
