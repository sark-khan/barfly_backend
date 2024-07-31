const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const feedbackSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, required: true },
    entityId: { type: String, required: true },
    question: { type: String, required: true },
    answerType: { type: String, required: true, enum: ["text", "box", "bar"] },
    answerOptions: { type: String, required: true },
    archive: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Feedback", feedbackSchema);
