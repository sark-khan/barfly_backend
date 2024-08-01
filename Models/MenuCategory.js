const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const counterMenuCategory = new Schema(
  {
    counterId: { type: mongoose.Schema.Types.ObjectId, ref: "Counter" },
    name: { type: String, required: true },
    icon: { type: String, required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "EntityDetails" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("CounterMenuCategory", counterMenuCategory);
