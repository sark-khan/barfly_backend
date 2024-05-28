const mongoose = require("mongoose");
const { INSIDER_TYPE } = require("../Utils/globalConstants");
const Schema = mongoose.Schema;

const insiderSchema = new Schema({
  insider: { type: String, required: true , unique: true},
  insiderType: { type: String, required: true, enum: INSIDER_TYPE },
});


module.exports = mongoose.model("Insider", insiderSchema);
