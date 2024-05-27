const mongoose = require("mongoose");
const { ROLES, PRODUCT_TYPE } = require("../Utils/globalConstants");
const Schema = mongoose.Schema;

const userSchema = new Schema({
  role: { type: String, required: true, enum: ROLES },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  contactNumber: { type: String, required: true },
  city: { type: String, required: true },
  street: { type: String, required: true },
  zipcode: { type: String, required: true },
  productName: { type: String, required: true },
  productType: { type: String, required: true, enum: PRODUCT_TYPE },
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }
});

module.exports = mongoose.model("User", userSchema);
