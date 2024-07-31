const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const counterMenuCategory = new Schema(
  {
    couterId: { type: mongoose.Schema.Types.ObjectId, ref: "Counter" },
    name: { type: String, required: true },
    icon: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CounterMenuCategory", counterMenuCategory);
