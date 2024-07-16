const mongoose = require("mongoose");
const InsiderElement = require("./InsiderElement");
const { FOOD_TYPE } = require("../Utils/globalConstants");

const Schema = mongoose.Schema;

const itemSchema = new Schema(
  {
    itemName: { type: String, require: true },
    price: { type: Number, require: true },
    quantity: { type: Number, require: true },
    description: { type: String, require: true },
    type: { type: String, enum: FOOD_TYPE, require: true },
    image: { type: String, require: true },
    insiderElementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InsiderElement",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MenuItem", itemSchema);
