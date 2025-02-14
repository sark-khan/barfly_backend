const mongoose = require("mongoose");
const { FOOD_TYPE } = require("../Utils/globalConstants");

const Schema = mongoose.Schema;

const itemSchema = new Schema(
  {
    availableQuantity: { type: Number },
    menuCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CounterMenuCategory",
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EntityDetails",
      required: true,
    },
    unit: { type: String },
    isVegan: { type: String },
    itemName: { type: String, required: true },
    quantity: { type: String, required: true },
    description: { type: String, required: true },
    image: { type: String, required: true },
    price: { type: Number },
    currency: { type: String },
    counterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Counter",
      required: true,
    },
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model("ItemDetails", itemSchema);
