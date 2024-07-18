const mongoose = require("mongoose");
const { PRODUCT_TYPE } = require("../Utils/globalConstants");

const Schema = mongoose.Schema;

const productSchema = new Schema(
  {
    city: { type: String },
    street: { type: String },
    zipcode: { type: String },
    entityName: { type: String, required: true },
    entityType: { type: String, enum: PRODUCT_TYPE, required: true },
    owner: { type: mongoose.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("EntityDetails", productSchema);
