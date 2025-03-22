// socketStore.js
class SocketStore {
    constructor() {
      this.socketId = "";
    }
  
    setSocketId(id) {
      this.socketId = id;
    }
  
    getSocketId() {
      return this.socketId;
    }
  }
  
  module.exports = new SocketStore();
  