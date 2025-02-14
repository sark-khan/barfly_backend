const mongoose = require("mongoose");
const { EXPERIENCE_TYPE } = require("../Utils/globalConstants");
const { ObjectId } = mongoose.Types;

const feedbackSchema = new mongoose.Schema(
  {
    userId: {
      type: ObjectId,
      ref: "User",
      required: true,
    },
    entityId: {
      type: ObjectId,
      ref: "entitydetails",
      required: true,
    },
    counterId: {
      type: ObjectId,
      ref: "counters",
      required: true,
    },

    experience: {
      type: {
        value: {
          type: String,
          enum: Object.values(EXPERIENCE_TYPE),
        },
        description: { type: String, default: "" },
      },
    },

    placingOrderProcess: {
      type: {
        value: { type: Number, required: true },
        description: { type: String, default: "" },
      },
    },

    statusUpdation: {
      type: {
        value: {
          type: String,
          enum: Object.values(EXPERIENCE_TYPE),
        },
        description: { type: String, default: "" },
      },
    },
  },
  { timestamps: true, minimize: false }
);

module.exports = new mongoose.model(
  "Userfeedback",
  feedbackSchema,
  "Userfeedback"
);
