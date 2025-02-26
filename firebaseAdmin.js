const admin = require("firebase-admin");
const serviceAccount = require("./Utils/firebaseKey.json");

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});
