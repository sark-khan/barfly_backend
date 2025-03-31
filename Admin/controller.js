const mongoose = require("mongoose");
const express = require("express");
const router = express.Router({ caseSensitive: true });

const { STATUS_CODES } = require("../Utils/globalConstants");
const {
  addAdmin,
  totalRevenueOfEntity,
  loginAdmin,
  getAdmins,
} = require("./services");

router.post("/add-admin", async (req, res) => {
  try {
    await addAdmin(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Admin added successfully." });
  } catch (error) {
    console.error("Error while registering the admin", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.post("/login-admin", async (req, res) => {
  try {
    const response = await loginAdmin(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Admin logged in successfully.", ...response });
  } catch (error) {
    console.error("Error while login the admin", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.get("/get-admins", async (req) => {
  try {
    await getAdmins(req);
  } catch (error) {
    console.error("Error while getting the admins", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.get("/total-revenue-of-entity", async (req, res) => {
  try {
    const totalAmount = await totalRevenueOfEntity(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Revenue fetched successfully.", totalAmount });
  } catch (error) {
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error getting orders of entity" });
  }
});

router.get("/get-owners", async (req, res) => {
  try {
    const totalAmount = await totalRevenueOfEntity(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Revenue fetched successfully.", totalAmount });
  } catch (error) {
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error getting orders of entity" });
  }
});

router.post("/get-money-spent-by-user", async (req, res) => {
  try {
    const { noOfOrders, moneySpent } = await getOrdersAndMoneySpent(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Revenue fetched successfully.",
      noOfOrders,
      moneySpent,
    });
  } catch (error) {
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error getting orders of entity" });
  }
});

module.exports = router;
