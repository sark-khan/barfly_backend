const mongoose = require("mongoose");

const OtpSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  contactNumber: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 3600 },
});

module.exports = mongoose.model("OtpSession", OtpSessionSchema);
