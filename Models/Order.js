const mongoose = require("mongoose");
const { ORDER_STATUS } = require("../Utils/globalConstants");

const Schema = mongoose.Schema;

const orderSchme = new Schema(
  {
    status: { type: String, required: true, enum: Object.values(ORDER_STATUS) },
    items: {
      type: [
        {
          itemId: { type: mongoose.Schema.Types.ObjectId, ref: "ItemDetails" },
          quantity: { type: Number },
        },
      ],
    },
    tokenNumber: { type: Number, required: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EntityDetails",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchme);
