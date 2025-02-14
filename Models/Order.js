const mongoose = require("mongoose");
const { ORDER_STATUS } = require("../Utils/globalConstants");

const Schema = mongoose.Schema;
const { ObjectId } = mongoose.Types;

const orderSchme = new Schema(
  {
    status: { type: String, required: true, enum: Object.values(ORDER_STATUS) },
    items: {
      type: [
        {
          itemId: { type: ObjectId, ref: "MenuItem" },
          quantity: { type: Number },
        },
      ],
    },
    // menuCategoryId: { type: ObjectId, required: true, ref: "CounterMenuCategory", required: true },
    counterId: {
      type: ObjectId,
      required: true,
      ref: "Counter",
      required: true,
    },
    entityId: {
      type: ObjectId,
      required: true,
      ref: "EntityDetails",
    },
    tokenNumber: { type: Number, required: true },
    userId: {
      type: ObjectId,
      required: true,
      ref: "User",
    },
    totalAmount: { type: Number, required: true },
    eventId: {
      type: ObjectId,
      ref: "Event",
    },
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model("Order", orderSchme);
