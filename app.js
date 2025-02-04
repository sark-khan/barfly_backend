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
const Counter = require("./Models/Counter");
const multer = require("multer");
const {
  uploadBufferToS3,
  generatePresignedUrl,
} = require("./Controller/aws-service");
const ItemDetails = require("./Models/ItemDetails");
const MenuItem = require("./Models/MenuItem");
const { STATUS_CODES } = require("./Utils/globalConstants");
const { ownerTrades } = require("./PdfServices/ownerTrades");
const verifyToken = require("./Utils/verifyToken");
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
require("./seeder");

const unProtectedApis = {
  "/api/customer/auth/login": true,
  "/api/customer/auth/register": true,
  "/api/customer/auth/count-tag": true,
};
app.use((req, res, next) => {
  if (unProtectedApis[req.path]) return next();

  return verifyToken(req, res, next);
});

app.use(
  "/api/owner/auth",
  require("./Controller/Owner/Authentication/controller")
);
app.use("/api/survey", require("./Controller/Owner/Feedback/controller"));
app.use("/api/owner", require("./Controller/Owner/controller"));
app.use(
  "/api/customer/auth",
  require("./Controller/Customer/Authentication/controller")
);
app.use("/api/customer/entities", require("./Controller/Customer/controller"));

app.use("/api/orders", orderController);

app.post("/api/update-menu-items", async (req, res) => {
  try {
    const getMenuitems = await Counter.updateMany(
      {},
      { $set: { isTableService: false, isSelfPickUp: true, totalTables: 0 } }
    );
    return res.status(200).json(getMenuitems);
  } catch (error) {
    console.log("error occured in update-menu");
    return res.status(500).json({ error });
  }
});

app.post("/api/upload-file", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("No file uploaded.");
    }
    const fileBuffer = req.file.buffer;
    const fileName = "coca-cola.png";

    const data = await uploadBufferToS3(fileBuffer, fileName);
    return res.status(200).json({
      message: "Uploaded successfully",
      location: data.Location,
    });
  } catch (error) {
    console.log("error occured in update-menu", error);
    return res.status(500).json({ error });
  }
});

app.get("/api/download-file", async (req, res) => {
  try {
    const { fileName } = req.query;
    const fileStream = generatePresignedUrl(fileName);
    return res.status(200).json({ fileStream });
  } catch (error) {
    console.log("error occured in update-menu", error);
    return res.status(500).json({ error });
  }
});

app.post("/update-entity-items", async (req, res) => {
  try {
    console.log({ ee: req.entityId });
    const itemsId = await ItemDetails.find({ entityId: req.entityId }).lean();
    console.log({ itemsId });
    const itemIds = itemsId.map((item) => item.itemId);
    await MenuItem.updateMany(
      { _id: { $in: itemIds } },
      { $set: { entityId: req.entityId } }
    );
    return res.status(200).json({ message: "Updated all the doc" });
  } catch (error) {
    return res.status(200).json({ message: error });
  }
});

app.get("/get-trade-pdf", async (req, res) => {
  try {
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="trade_confirmation.pdf"'
    );
    res.setHeader("Content-Type", "application/pdf");

    // Call the ownerTrades function, passing the response object `res`
    ownerTrades(res);
  } catch (error) {
    console.error("Error occured whule creating trade pdf", error);
    return res
      .status(STATUS_CODES.BAD_REQUEST)
      .json({ message: "Error occured while trade pdf", error });
  }
});
const port = process.env.PORT;

app.listen(port, () => {
  console.log(`Server is listening at http://localhost:${port}`);
});
