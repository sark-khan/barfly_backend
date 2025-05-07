const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const { ObjectId } = mongoose.Types;

const offlineOrderLogsSchema = new Schema(
  {
    items: {
      type: [
        {
          itemId: { type: ObjectId, ref: "ItemDetails" },
          quantity: { type: Number },
        },
      ],
    },
    counterId: {
      type: ObjectId,
      ref: "Order",
      required: true,
    },
    entityId: {
      type: ObjectId,
      ref: "EntityDetails",
      required: true,
    },
    countrTag: { type: String, required: true, ref: "User" },
    userId: {
      type: ObjectId,
      ref: "User",
      required: true,
    },
    internalNumber: { type: String, default: "" },
    totalAmount: { type: Number, required: true },
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model("OfflineOrders", offlineOrderLogsSchema);
