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
  "/auth/owner-api",
  require("./OwnerServices/Authentication/controller")
);
app.use("/api/owner", require("./OwnerServices/Insider/controller"));
app.use(
  "/api/customer",
  require("./CustomerServices/CustomerEvents/controller")
);
app.use(
  "/auth/customer-api",
  require("./CustomerServices/Authentication/controller")
);

const port = process.env.PORT;

app.listen(port, () => {
  console.log(`Server is listening at http://localhost:${port}`);
});
