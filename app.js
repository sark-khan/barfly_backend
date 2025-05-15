const express = require("express");
require("dotenv").config();
require("./db");
require("./redis");
require("./cron/emitEvent");
require("./server");
require("./Utils/bullQueue");
require("./Utils/emitProcessor");

const path = require("path");
const bodyParser = require("body-parser");
const cors = require("cors");
const multer = require("multer");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));

const { setIo } = require("./Utils/socket");
const StripeModel = require("./Models/Stripe");
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const {
  STATUS_CODES,
  ORDER_STATUS,
  STRIPE_PAYMENT_STATUS,
} = require("./Utils/globalConstants");

const {
  uploadBufferToS3,
  generatePresignedUrl,
} = require("./Controller/aws-service");
const { ownerTrades } = require("./PdfServices/ownerTrades");
const verifyToken = require("./Utils/verifyToken");
const { sendFirebaseNotification } = require("./Utils/commonFunction");

const orderController = require("./Controller/orderController");
const StripeController = require("./Controller/stripeController");
const adminController = require("./Admin/controller");

const Counter = require("./Models/Counter");
const ItemDetails = require("./Models/ItemDetails");
const MenuItem = require("./Models/MenuItem");
const Admin = require("./Models/Admin");
const User = require("./Models/User");

const storage = multer.memoryStorage();
const upload = multer({ storage });

const unProtectedApis = {
  "/api/customer/auth/login": true,
  "/api/customer/auth/register": true,
  "/api/customer/auth/countR-tag": true,
  "/api/owner/auth/register": true,
  "/api/owner/auth/login": true,
  "/api/customer/auth/check-and-generate-countR-tag": true,
  "/api/customer/entities/get-menu-category-items": true,
  "/api/customer/entities/recommended-items": true,
  "/api/owner/restaurant/email-exist": true,
  "/api/admins/login-admin": true,
  "/api/admins/reset-password": true,
  "/api/stripe/get-stripe-accounts": true,
  "/webhooks": true,
};

app.use("/api/health-check", (req, res) => {
  return res.status(STATUS_CODES.OK).json({
    message: `Countr service running...!`,
    time: new Date(),
  });
});

app.use("/.well-known", express.static(path.join(__dirname, ".well-known")));

app.get("/", (req, res) => {
  res.send("Apple Pay Domain Verification Running");
});

app.use((req, res, next) => {
  if (unProtectedApis[req.path]) return next();
  return verifyToken(req, res, next);
});

// API Routes
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

// Stripe Webhook
app.post(
  "/webhooks",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    console.log("Received webhook call");
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Webhook signature verification failed.", err.message);
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .send(`Webhook Error: ${err.message}`);
    }

    const intent = event.data.object;
    const paymentIntentId = intent.id;

    switch (event.type) {
      case "payment_intent.succeeded":
        console.log(`Payment intent succeeded: ${paymentIntentId}`);
        break;
      case "payment_intent.payment_failed":
        console.log(`Payment intent failed: ${paymentIntentId}`);
        break;
      case "payment_intent.canceled":
        console.log(`Payment intent canceled: ${paymentIntentId}`);
        break;
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.sendStatus(STATUS_CODES.OK);
  }
);

// Custom Routes
app.post("/api/update-menu-items", async (req, res) => {
  try {
    const result = await Counter.updateMany(
      {},
      { $set: { isTableService: false, isSelfPickUp: true, totalTables: 0 } }
    );
    return res.status(200).json(result);
  } catch (error) {
    console.log("Error in update-menu-items", error);
    return res.status(500).json({ error });
  }
});

app.post("/api/upload-file", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send("No file uploaded.");

    const data = await uploadBufferToS3(req.file.buffer, "coca-cola.png");
    return res.status(200).json({
      message: "Uploaded successfully",
      location: data.Location,
    });
  } catch (error) {
    console.log("Error in upload-file", error);
    return res.status(500).json({ error });
  }
});

app.get("/api/download-file", async (req, res) => {
  try {
    const { fileName } = req.query;
    const fileStream = generatePresignedUrl(fileName);
    return res.status(200).json({ fileStream });
  } catch (error) {
    console.log("Error in download-file", error);
    return res.status(500).json({ error });
  }
});

app.post("/update-entity-items", async (req, res) => {
  try {
    const items = await ItemDetails.find({ entityId: req.entityId }).lean();
    const itemIds = items.map((item) => item.itemId);

    await MenuItem.updateMany(
      { _id: { $in: itemIds } },
      { $set: { entityId: req.entityId } }
    );

    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Updated all the docs" });
  } catch (error) {
    return res
      .status(STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

app.get("/api/get-trade-and-download-pdf", async (req, res) => {
  try {
    const signedUrl = await ownerTrades(req);
    return res.status(STATUS_CODES.OK).json({ downloadUrl: signedUrl });
  } catch (error) {
    console.error("Error while creating trade PDF", error);
    return res
      .status(STATUS_CODES.SERVER_ERROR)
      .json({ message: "PDF creation failed", error });
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
    return res.status(STATUS_CODES.BAD_REQUEST).json({
      message: "FCM token is required",
    });
  }

  await User.updateOne({ _id: req.userId }, { $addToSet: { fcmToken } });

  return res.json({ message: "FCM token registered successfully" });
});

// Preload global fees
const preloadPlatformFees = async () => {
  const admin = await Admin.findOne({ isAdmin: true }).lean();
  global.PLATFORM_FEES = admin?.platformFees || 0;
};

preloadPlatformFees();

// Socket.IO Setup
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

// Start server
const port = process.env.PORT;
server.listen(port, () => {
  console.log(`Server is listening at http://localhost:${port}`);
});

module.exports = { io };
