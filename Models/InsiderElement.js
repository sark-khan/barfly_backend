const mongoose = require("mongoose");
const { INSIDER_TYPE } = require("../Utils/globalConstants");
const Schema = mongoose.Schema;

const insiderElement = new Schema(
  {
    insiderId: { type: mongoose.Schema.Types.ObjectId, ref: "Insider" },
    elementType: { type: String, required: true, enum: INSIDER_TYPE },
    name: { type: String, required: true },
    icon: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("InsiderElement", insiderElement);
