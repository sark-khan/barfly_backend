const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const bodyParser = require("body-parser");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(bodyParser.json());

app.use(express.static("public"));

io.on("connection", (socket) => {
  console.log("A restaurant connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("A restaurant disconnected:", socket.id);
  });
});

module.exports = { io };
