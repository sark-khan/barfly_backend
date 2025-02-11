const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const { ObjectId } = mongoose.Types;

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
        type: ObjectId,
        ref: "Counter",
        required: true,
      },
    ],
    ageLimit: { type: Number, required: true },
    ownerId: { type: ObjectId, ref: "User", required: true },
    entityId: {
      type: ObjectId,
      ref: "EntityDetails",
      required: true,
    },
    activeUsers: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Event", eventSchema);
