const mongoose = require("mongoose");
const globalConstants = require("../Utils/globalConstants"); // Import entire module

const ALL_ANSWER_TYPES = globalConstants.ALL_ANSWER_TYPES; // ✅ Ensure it's defined

const { ObjectId } = mongoose.Types;

const feedbackQuestionSchema = new mongoose.Schema({
  userId: { type: ObjectId, ref: "User" },
  entityId: { type: ObjectId, ref: "EntityDetails" },
  question: { type: String, required: true },
  comment: { type: Boolean, default: true },
  answerType: {
    type: [String],
    enum: ALL_ANSWER_TYPES, // ✅ Now this will work
    required: true,
  },
});

module.exports = mongoose.model(
  "FeedbackQuestions",
  feedbackQuestionSchema,
  "FeedbackQuestions"
);
