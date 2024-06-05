const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const feedbackSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  comments: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
});

module.exports = mongoose.model("Feedback", feedbackSchema);
