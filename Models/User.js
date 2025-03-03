const mongoose = require("mongoose");
const { ROLES, STATUS } = require("../Utils/globalConstants");
const Schema = mongoose.Schema;

const userSchema = new Schema(
  {
    role: { type: String, required: true, enum: ROLES },
    fullName: { type: String },
    email: { type: String },
    password: { type: String },
    language: { type: String },
    contactNumber: { type: String },
    dob: { type: String },
    address: { type: String },
    city: { type: String },
    street: { type: String },
    zipcode: { type: String },
    country: { type: String },
    emailOtpVerified: { type: Boolean, default: false },
    phoneOtpVerified: { type: Boolean, default: false },
    locationEnabled: { type: Boolean, default: false },
    status: { type: String, enum: Object.values(STATUS) },
  },
  { timestamps: true, minimize: false }
);
module.exports = mongoose.model("User", userSchema, "User");
