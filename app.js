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

const orderController = require("./Controller/orderController");
const MenuItem = require("./Models/MenuItem");

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

app.use("/api/orders", orderController)

app.post("/api/update-menu-items",async (req, res)=>{
  try {
    const getMenuitems= await MenuItem.updateMany({}, {$set:{entityId: "6697c502d0c2812e4e1aa554"}});
    return res.status(200).json(getMenuitems);
  } catch (error) {
    console.log("error occured in update-menu");
    return res.status(500).json({error});
  }
} )

const port = process.env.PORT;

app.listen(port, () => {
  console.log(`Server is listening at http://localhost:${port}`);
});
