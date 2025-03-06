const mongoose = require("mongoose");
const { STATUS } = require("../Utils/globalConstants");
const { ObjectId } = mongoose.Types;

const DiscountSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    type: { type: String, enum: ["percentage", "fixed"], required: true },
    value: { type: Number, required: true }, // Discount value (10% or $10)
    maxDiscount: { type: Number }, // Optional max discount for percentage type
    minAmount: { type: Number, default: 0 },
    usageLimit: { type: Number, default: 1 },
    usedCount: { type: Number, default: 0 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: Object.values(STATUS) },
    entityId: { type: ObjectId },
    userId: { type: ObjectId },
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model("Discount", DiscountSchema);
