const express = require("express");
const { documentRouter } = require("./documentRoutes");
const { segmentRouter } = require("./segmentRoutes");
const { projectRouter } = require("./projectRoutes");
const aiProjectRouter = require("./aiProjectRoutes");
const { tmRouter } = require("./tmRoutes");
const { glossaryRouter } = require("./glossaryRoutes");
const { exportRouter } = require("./exportRoutes");
const { screenshotRouter } = require("./screenshotRoutes");

const publicApiRouter = require("./v1/publicApiRoutes");

const apiRouter = express.Router();

// Mount public API v1 endpoints
apiRouter.use("/v1", publicApiRouter);

// Mount modular sub-routers
apiRouter.use(documentRouter);
apiRouter.use(segmentRouter);
apiRouter.use(projectRouter);
apiRouter.use(aiProjectRouter);
apiRouter.use(tmRouter);
apiRouter.use(glossaryRouter);
apiRouter.use(exportRouter);
apiRouter.use(screenshotRouter);

apiRouter.get("/", (request, response) => {
  response.json({
    message: "Server Running",
    api_v1: "/api/v1/health"
  });
});

module.exports = {
  apiRouter
};

