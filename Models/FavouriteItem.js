const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const favouriteItems = new Schema(
  {
    userId: { type: mongoose.Types.ObjectId, ref: "User", required: true },
    entityType: [{ type: mongoose.Types.ObjectId, ref: "Product" }],
    favouriteItem: [{ type: mongoose.Types.ObjectId, ref: "MenuItem" }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("FavoriteItem", favouriteItems);
