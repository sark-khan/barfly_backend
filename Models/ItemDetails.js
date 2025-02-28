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
    nutritionType: { type: String, enum: Object.values(FOOD_TYPE) },
    isVegan: { type: Boolean, default: false },
    itemName: { type: String, required: true },
    description: { type: String, required: true },
    image: { type: String },

    price: { type: Number },
    currency: { type: String },
    // counterId: {
    //   type: ObjectId,
    //   ref: "Counter",
    // },
    counterIds: [
      {
        type: ObjectId,
        ref: "Counter",
        required: true,
      },
    ],
    isOutOfStock: { type: Boolean, default: false },
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model("ItemDetails", itemSchema);
