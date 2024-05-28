const express = require("express");
require('./db')
const app = express();
const bodyParser = require("body-parser");

app.use(bodyParser.json());

app.use("/api/auth", require("./Controller/Authentication/controller"));
app.use("/api/owner", require("./Controller/insider/controller"));

const port = process.env.PORT;

app.listen(port, () => {
  console.log(`Server is listening at http://localhost:${port}`);
});
