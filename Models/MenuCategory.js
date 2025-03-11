const mongoose = require("mongoose");
const { FOOD_TYPE } = require("../Utils/globalConstants");
const Schema = mongoose.Schema;
const { ObjectId } = mongoose.Types;

const counterMenuCategory = new Schema(
  {
    counterIds: [
      {
        type: ObjectId,
        ref: "Counter",
        required: true,
      },
    ],
    categoryName: {
      type: String,
      required: true,
    },
    entityId: {
      type: ObjectId,
      required: true,
      ref: "EntityDetails",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CounterMenuCategory", counterMenuCategory);
