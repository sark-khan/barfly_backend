const mongoose = require("mongoose");
// const { INSIDER_TYPE } = require("../Utils/globalConstants");
const Schema = mongoose.Schema;

const insiderSchema = new Schema({
  insider: { type: String, required: true , unique: true},
  // insiderType: [{ type: String, required: true, enum: INSIDER_TYPE }],
  // barItems: [{type: Schema.Types.ObjectId, ref: 'Bar'}],
  // loungeItems: [{type: Schema.Types.ObjectId, ref: 'Lounge'}],
  // feedbackItems: [{type: Schema.Types.ObjectId, ref: 'Feedback'}]
});


module.exports = mongoose.model("Insider", insiderSchema);
