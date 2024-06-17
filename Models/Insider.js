const mongoose = require("mongoose");
const { INSIDER_TYPE } = require("../Utils/globalConstants");
const Schema = mongoose.Schema;

const insiderSchema = new Schema(
  {
    insiderName: { type: String, required: true, unique: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    hasBar: { type: Boolean, default: false },
    hasLounge: { type: Boolean, default: false },
    hasFeedback: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Insider", insiderSchema);
