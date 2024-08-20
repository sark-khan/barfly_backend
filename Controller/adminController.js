const express = require("express");
const mongoose = require("mongoose");

const router = express.Router({ caseSensitive: true });

const { totalRevenueOfEntity, getOrdersAndMoneySpent } = require("../CustomerServices/adminService");
const { STATUS_CODES } = require("../Utils/globalConstants");
const verifyToken = require("../Utils/verifyToken");

router.use(verifyToken)


router.get("/total-revenue-of-entity", async (req, res) => {
    try {
        const totalAmount = await totalRevenueOfEntity(req);
        return res.status(STATUS_CODES.OK).json({ message: "Revenue fetched successfully.", totalAmount })

    } catch (error) {
        return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({ message: error.message || "Error getting orders of entity" })
    }
})


router.get("/get-owners", async (req, res) => {
    try {
        const totalAmount = await totalRevenueOfEntity(req);
        return res.status(STATUS_CODES.OK).json({ message: "Revenue fetched successfully.", totalAmount })

    } catch (error) {
        return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({ message: error.message || "Error getting orders of entity" })
    }
})

router.post("/get-money-spent-by-user", async (req, res) => {
    try {
        const { noOfOrders, moneySpent } = await getOrdersAndMoneySpent(req);
        return res.status(STATUS_CODES.OK).json({ message: "Revenue fetched successfully.", noOfOrders, moneySpent })

    } catch (error) {
        return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({ message: error.message || "Error getting orders of entity" })
    }
})


module.exports = router;
