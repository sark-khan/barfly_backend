const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const itemSchema = new Schema(
  {
    price: { type: Number, required: true },
    availableQuantity: { type: Number, required: true },
    currency: { type: String, required: true },
    menuCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CounterMenuCategory",
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EntityDetails",
      required: true,
    },
    counterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Counter",
      required: true,
    },
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItem",
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ItemDetails", itemSchema);
