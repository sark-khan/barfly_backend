const express = require("express");
require("./db");
require("./redis");
require("./cron/emitEvent");
require("./server");
require("./Utils/bullQueue");
require("./Utils/emitProcessor");
// const setupCron = require("./cron/cron");

const path = require("path");
const app = express();
const bodyParser = require("body-parser");
const cors = require("cors");
app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));
const { setIo } = require("./Utils/socket");

const http = require("http");
const { Server } = require("socket.io");
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
  transports: ["websocket", "polling"],
});

const { orderSocket } = require("./server");
orderSocket(io);
setIo(io);

// setupCron(io);
module.exports = { io };

const orderController = require("./Controller/orderController");
const StripeController = require("./Controller/stripeController");
const Counter = require("./Models/Counter");
const adminController = require("./Admin/controller");
const multer = require("multer");
const {
  uploadBufferToS3,
  generatePresignedUrl,
} = require("./Controller/aws-service");
const ItemDetails = require("./Models/ItemDetails");
const MenuItem = require("./Models/MenuItem");
const Admin = require("./Models/Admin");
const { STATUS_CODES, ORDER_STATUS } = require("./Utils/globalConstants");
const { ownerTrades } = require("./PdfServices/ownerTrades");
const verifyToken = require("./Utils/verifyToken");
const { sendFirebaseNotification } = require("./Utils/commonFunction");
const User = require("./Models/User");
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
// const admin = require("./firebaseConfig");

const unProtectedApis = {
  "/api/customer/auth/login": true,
  "/api/customer/auth/register": true,
  "/api/customer/auth/countR-tag": true,
  // "/api/customer/entities/get-entities": true,
  "/api/owner/auth/register": true,
  "/api/owner/auth/login": true,
  "/api/customer/auth/check-and-generate-countR-tag": true,
  "/api/owner/auth/register": true,
  "/api/owner/auth/login": true,

  "/api/customer/entities/get-menu-category-items": true,
  "/api/customer/entities/recommended-items": true,
  "/api/get-trade-pdf": true,
  "/api/owner/restaurant/email-exist": true,
  "/api/admins/login-admin": true,
  "/api/admins/reset-password": true,

  "/api/stripe/get-stripe-accounts": true,
};

app.use("/api/health-check", (req, res) => {
  return res.status(STATUS_CODES.OK).json({
    message: `Countr service running...!`,
    time: new Date(),
  });
});

app.use("/.well-known", express.static(path.join(__dirname, ".well-known")));

// Optional: root route
app.get("/", (req, res) => {
  res.send("Apple Pay Domain Verification Running");
});

app.use((req, res, next) => {
  if (unProtectedApis[req.path]) return next();

  return verifyToken(req, res, next);
});

app.use(
  "/api/owner/auth",
  require("./Controller/Owner/Authentication/controller")
);
app.use("/api/survey", require("./Controller/Owner/Feedback/controller"));
app.use("/api/owner/restaurant", require("./Controller/Owner/controller"));
app.use(
  "/api/customer/auth",
  require("./Controller/Customer/Authentication/controller")
);
app.use("/api/customer/entities", require("./Controller/Customer/controller"));

app.use("/api/orders", orderController);
app.use("/api/stripe", StripeController);
app.use("/api/admins", adminController);

const preloadPlatformFees = async () => {
  const admin = await Admin.findOne({ isAdmin: true }).lean();
  global.PLATFORM_FEES = admin?.platformFees || 0;
};

preloadPlatformFees();

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

app.get("/api/get-trade-pdf", async (req, res) => {
  try {
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="trade_confirmation.pdf"'
    );
    res.setHeader("Content-Type", "application/pdf");

    await ownerTrades(req, res);
  } catch (error) {
    console.error("Error occurred while creating trade PDF", error);
    return res.status(400).json({ message: "PDF creation failed", error });
  }
});

app.post("/send-firebase-notification", async (req, res) => {
  const { token, title, body } = req.body;

  if (!token)
    return res
      .status(STATUS_CODES.BAD_REQUEST)
      .json({ error: "FCM token is required" });

  await sendFirebaseNotification(token, title, body);
  res.json({ success: true, message: "Notification sent!" });
});

app.post("/api/register-token", async (req, res) => {
  const { fcmToken } = req.body;

  if (!fcmToken) {
    throw {
      status: STATUS_CODES.BAD_REQUEST,
      message: "FCM token is required",
    };
  }

  await User.updateOne({ _id: req.userId }, { $addToSet: { fcmToken } });

  return { message: "FCM token registered successfully" };
});

const port = process.env.PORT;

server.listen(port, () => {
  console.log(`Server is listening at http://localhost:${port}`);
});
