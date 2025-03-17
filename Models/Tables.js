const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;

const tableSchema = new mongoose.Schema(
  {
    tableCount: [{ type: String }],
    userId: { type: ObjectId },
    entityId: { type: ObjectId },
    counterIds: [
      {
        type: ObjectId,
        ref: "Counter",
        required: true,
      },
    ],
  },
  { timestamps: true, minimize: false }
);
module.exports = mongoose.model("Table", tableSchema);
