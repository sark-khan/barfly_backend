const jwt = require("jsonwebtoken");

const User = require("./Models/User");
const { SECRET_KEY } = require("./Utils/commonFunction");

const verifyToken = async (token) => {
  return new Promise((resolve, reject) => {
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
      if (err) return reject(new Error("Invalid token"));
      resolve(decoded);
    });
  });
};

const orderSocket = async (io) => {
  io.on("connection", async (socket) => {
    console.log(socket.handshake.headers);
    console.log(">>>>>>>>>>>>>>.");
    console.log(socket.handshake.query);
    console.log(socket.id);
    const token =
      socket.handshake.headers.token || socket.handshake.query.token;
    // socket.handshake.headers.token?.split(" ")[1];

    if (!token) {
      console.log("No token provided, disconnecting...");
      return socket.disconnect();
    }

    try {
      const decoded = await verifyToken(token);
      const userId = decoded.userId;
      const entityId= decoded.entityId;

      if (!userId) {
        console.log("Invalid token, disconnecting...");
        return socket.disconnect();
      }

      console.log(`User authenticated: ${userId}`);

      await User.updateOne({ _id: userId }, { $set: { socketId: socket.id } });

      // socket.on("newOrder", async () => {
      //   console.log(`New order event received from ${userId}`);
      // });
      console.log({entityId});
      socket.join(entityId);
      console.log(`User ${userId} joined room: ${entityId}`);
      socket.on("disconnect", async () => {
        console.log("A restaurant disconnected:", socket.id);
        await User.updateOne({ _id: userId }, { $unset: { socketId: "" } });
      });
    } catch (error) {
      console.error("Error:", error);
      console.log("Token verification failed:", error.message);
      return socket.disconnect();
    }
  });
};

module.exports = { orderSocket };
