const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const countTagSchema = new Schema(
  {
    countTag: { type: String },
    userId: {
      type: mongoose.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model("Counttag", countTagSchema, "Counttag");
