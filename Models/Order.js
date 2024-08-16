const mongoose = require("mongoose");
const { ORDER_STATUS } = require("../Utils/globalConstants");

const Schema = mongoose.Schema;

const orderSchme = new Schema(
    {
        status: { type: String, required: true, enum: Object.values(ORDER_STATUS) },
        items: { type: [{ itemId: { type: mongoose.Schema.Types.ObjectId, ref: "MenuItem" }, quantity: { type: Number } }] },
        // menuCategoryId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "CounterMenuCategory", required: true },
        counterId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Counter", required: true },
        entityId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "EntityDetails" },
        tokenNumber: { type: Number, required: true },
        userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchme);
