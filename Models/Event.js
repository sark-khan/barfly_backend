const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const eventSchema = new Schema(
  {
    locationName: { type: String, required: true },
    eventName: { type: String, required: true },
    date: { type: Date, required: true },
    from: { type: Date, required: true },
    to: { type: Date, required: true },
    insiders: [
      {
        insiderId: {
          type: mongoose.Types.ObjectId,
          ref: "Insider",
          required: true,
        },
        isBar: { type: Boolean, default: false },
        isLounge: { type: Boolean, default: false },
        isFeedback: { type: Boolean, default: false },
      },
    ],
    ageLimit: { type: Number, required: true },
    ownerId: { type: mongoose.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Event", eventSchema);
