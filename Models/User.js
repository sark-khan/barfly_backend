const mongoose = require("mongoose");
const { ROLES, PRODUCT_TYPE } = require("../Utils/globalConstants");
const Schema = mongoose.Schema;

const userSchema = new Schema(
  {
    role: { type: String, required: true, enum: ROLES },
    fullName: { type: String, required: true },
    email: { type: String, required: true },
    password: { type: String, required: true },
    language: { type: String },
    dob: { type: String },
    address: { type: String },
    city: { type: String },
    street: { type: String },
    zipcode: { type: String },
    country: { type: String },
  },
  { timestamps: true, minimize: false }
);

// userSchema.pre("save", async function (next) {
//   if (!this.isModified("password")) {
//     return next();
//   }
// });

module.exports = mongoose.model("User", userSchema, "User");
