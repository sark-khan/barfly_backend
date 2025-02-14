const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const { ObjectId } = mongoose.Types;

const counterMenuCategory = new Schema(
  {
    counterId: { type: ObjectId, ref: "Counter" },
    name: { type: String, required: true },
    entityId: {
      type: ObjectId,
      required: true,
      ref: "EntityDetails",
    },
    amount: { type: Number },
    description: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CounterMenuCategory", counterMenuCategory);
