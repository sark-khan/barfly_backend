const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const eventSchema = new Schema(
  {
    eventName: { type: String, required: true },
    startingDate: { type: Date },
    endDate: { type: Date },
    isRepetitive: { type: Boolean, default: false },
    repetitiveDays: { type: [Number] },
    from: { type: Date, required: true },
    to: { type: Date, required: true },
    counterIds: [
      {
        type: mongoose.Types.ObjectId,
        ref: "Counter",
        required: true,
      },
    ],
    ageLimit: { type: Number, required: true },
    ownerId: { type: mongoose.Types.ObjectId, ref: "User", required: true },
    entityId: {
      type: mongoose.Types.ObjectId,
      ref: "EntityDetails",
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Event", eventSchema);
