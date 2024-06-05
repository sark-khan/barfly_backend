const mongoose = require("mongoose");
const { DRINKS_SIZE, FOOD_TYPE } = require("../Utils/globalConstants");
const Schema = mongoose.Schema;

const barSchema = new Schema({
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
  drinks: [
    {
      name: { type: String },
      size: { type: String, enum: DRINKS_SIZE },
      alcoholContent: { type: Boolean, required: true },
    },
  ],
  food: [
    {
      name: { type: String },
      type: { type: String, enum: FOOD_TYPE, required: true },
    },
  ],
  image: { type: String },
});

module.exports = mongoose.model("Bar", barSchema);
