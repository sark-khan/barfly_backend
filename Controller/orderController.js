const express = require("express");
const mongoose = require("mongoose");

const router = express.Router({ caseSensitive: true });

const { createOrder, updateStatusOfOrder, getEntityOrders, getOrderGroupByYears } = require("../CustomerServices/orderService");
const { STATUS_CODES } = require("../Utils/globalConstants");
const verifyToken = require("../Utils/verifyToken");

router.use(verifyToken)

router.post("/create-order", async (req, res) => {
    const session = await mongoose.startSession();
    try {
        let response;
        await session.withTransaction(async () => {
            response = await createOrder(req, session)
        });
        return res.status(STATUS_CODES.OK).json({ message: "Order create Successfully.", response });
    } catch (error) {
        console.error("Error while adding order", error);
        return res
            .status(error.status || STATUS_CODES.SERVER_ERROR)
            .json({ message: error.message || "Error while adding order" });
    }
    finally {
        session.endSession();
    }
});

router.post("/update-status-of-order", async (req, res) => {
    try {
        await updateStatusOfOrder(req)
        return res.status(STATUS_CODES.OK).json({ message: "Status of order updated successfully." });
    } catch (error) {
        console.error("Error while updating order status", error);
        return res
            .status(error.status || STATUS_CODES.SERVER_ERROR)
            .json({ message: error.message || "Error while updating order status" });
    }
});

router.post("/get-entity-orders", async (req, res) => {
    try {
        const { data, totalCount } = await getEntityOrders(req)
        return res.status(STATUS_CODES.OK).json({ message: "Orders fetched successfully.", data, totalCount });
    } catch (error) {
        console.error("Error while fetching orders", error);
        return res
            .status(error.status || STATUS_CODES.SERVER_ERROR)
            .json({ message: error.message || "Error while fetching orders" });
    }
});


router.post("/get-users-orders-group-by-years", async (req, res) => {
    try {
        const data = await getOrderGroupByYears(req)
        return res.status(STATUS_CODES.OK).json({ message: "Orders fetched successfully.", data });
    } catch (error) {
        console.error("Error while fetching orders", error);
        return res
            .status(error.status || STATUS_CODES.SERVER_ERROR)
            .json({ message: error.message || "Error while fetching orders" });
    }
});

module.exports = router;
