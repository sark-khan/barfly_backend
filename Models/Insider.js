const mongoose = require("mongoose");
const { INSIDER_TYPE } = require("../Utils/globalConstants");
const Schema = mongoose.Schema;

const insiderSchema = new Schema(
  {
    insiderName: { type: String, required: true, unique: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    insiderType: { type: String, required: true, enum: INSIDER_TYPE },
    // barItems: [{type: Schema.Types.ObjectId, ref: 'Bar'}],
    // loungeItems: [{type: Schema.Types.ObjectId, ref: 'Lounge'}],
    // feedbackItems: [{type: Schema.Types.ObjectId, ref: 'Feedback'}]
  },
  { timestamps: true }
);

module.exports = mongoose.model("Insider", insiderSchema);
