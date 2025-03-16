const admin = require("firebase-admin");
const { getMessaging } = require("firebase-admin/messaging");

const serviceAccount = require("./Utils/firebaseKey.json");

// Initialize Firebase Admin SDK
const app = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Export messaging instance
const messaging = getMessaging(app);

module.exports = { admin, messaging };
