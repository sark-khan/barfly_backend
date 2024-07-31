const mongoose = require("mongoose");
const InsiderElement = require("./MenuCategory");
const { FOOD_TYPE } = require("../Utils/globalConstants");

const Schema = mongoose.Schema;

const itemSchema = new Schema(
  {
    itemName: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: String, required: true },
    availableQuantity: { type: Number, required: true },
    currency: { type: String, required: true },
    description: { type: String, required: true },
    type: { type: String, enum: FOOD_TYPE, required: true },
    image: { type: String, required: true },
    menuCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CounterMenuCategory",
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MenuItem", itemSchema);
