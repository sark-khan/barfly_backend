const express = require("express");
require("./db");
require("./redis");
require("./cron");
const app = express();
const bodyParser = require("body-parser");
const cors = require("cors");
app.use(cors());
// app.use(bodyParser.json());
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));

require("./seeder");
app.use(
  "/api/owner/auth",
  require("./Controller/Owner/Authentication/controller")
);
app.use("/api/owner", require("./Controller/Owner/controller"));
app.use(
  "/api/customer/auth",
  require("./Controller/Customer/Authentication/controller")
);
app.use("/api/customer", require("./Controller/Customer/controller"));

const port = process.env.PORT;

app.listen(port, () => {
  console.log(`Server is listening at http://localhost:${port}`);
});
