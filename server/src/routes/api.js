const express = require("express");
const { documentRouter } = require("./documentRoutes");
const { segmentRouter } = require("./segmentRoutes");
const { projectRouter } = require("./projectRoutes");
const aiProjectRouter = require("./aiProjectRoutes");
const { tmRouter } = require("./tmRoutes");
const { glossaryRouter } = require("./glossaryRoutes");
const { exportRouter } = require("./exportRoutes");

const apiRouter = express.Router();

// Mount modular sub-routers
apiRouter.use(documentRouter);
apiRouter.use(segmentRouter);
apiRouter.use(projectRouter);
apiRouter.use(aiProjectRouter);
apiRouter.use(tmRouter);
apiRouter.use(glossaryRouter);
apiRouter.use(exportRouter);

apiRouter.get("/", (request, response) => {
  response.json({
    message: "Server Running"
  });
});

module.exports = {
  apiRouter
};

