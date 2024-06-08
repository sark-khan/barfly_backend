const express = require("express");
require("./db");
const app = express();
const bodyParser = require("body-parser");
const cors = require("cors");
app.use(cors());
// app.use(bodyParser.json());
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));



app.use("/api/auth", require("./Controller/Authentication/controller"));
app.use("/api/owner", require("./Controller/Insider/controller"));

const port = process.env.PORT;

app.listen(port, () => {
  console.log(`Server is listening at http://localhost:${port}`);
});
