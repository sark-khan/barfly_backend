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
    image: { type: String },
    entityContactNumber: { type: String },
    plotNo: { type: Number },
    floor: { type: Number },
    country: { type: String },
    buildingName: { type: String },
    landMark: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("EntityDetails", productSchema);
