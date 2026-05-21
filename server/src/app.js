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

app.use("/", apiRouter);

module.exports = {
  app
};
