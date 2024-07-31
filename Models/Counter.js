const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const counterSchema = new Schema(
  {
    counterName: { type: String, required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    entityId: { type: mongoose.Schema.Types.ObjectId, ref: "EntityDetails" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Counter", counterSchema);
