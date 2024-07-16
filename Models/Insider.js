const mongoose = require("mongoose");
const { INSIDER_TYPE } = require("../Utils/globalConstants");
const Schema = mongoose.Schema;

const insiderSchema = new Schema(
  {
    insiderName: { type: String, required: true},
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Insider", insiderSchema);
