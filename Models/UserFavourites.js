const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const favouriteSchema = new Schema(
  {
    userId: { type: mongoose.Types.ObjectId, ref: "User", required: true },
    favouritesEvents: [{ type: mongoose.Types.ObjectId, ref: "Event" }],
    favouritesItems: [{ type: mongoose.Types.ObjectId, ref: "MenuItem" }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("UserFavourite", favouriteSchema);
