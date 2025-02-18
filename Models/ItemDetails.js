const mongoose = require("mongoose");
const { FOOD_TYPE } = require("../Utils/globalConstants");

const { ObjectId } = mongoose.Types;

const Schema = mongoose.Schema;

const itemSchema = new Schema(
  {
    availableQuantity: { type: Number },
    menuCategoryId: {
      type: ObjectId,
      ref: "CounterMenuCategory",
    },
    entityId: {
      type: ObjectId,
      ref: "EntityDetails",
    },
    unit: { type: String },
    isVegan: { type: String },
    itemName: { type: String, required: true },
    quantity: { type: String, required: true },
    description: { type: String, required: true },
    image: { type: String },

    price: { type: Number },
    currency: { type: String },
    counterId: {
      type: ObjectId,
      ref: "Counter",
    },
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model("ItemDetails", itemSchema);
