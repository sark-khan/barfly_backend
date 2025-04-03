const mongoose = require("mongoose");
const express = require("express");
const router = express.Router({ caseSensitive: true });

const { STATUS_CODES } = require("../Utils/globalConstants");
const {
  addAdmin,
  loginAdmin,
  getAdmins,
  editAdmin,
  getUsers,
  getRestaurants,
  getRestaurantOrders,
  getTransactionLogs,
  getAdminUserDetails,
  getDashboardAnalytics,
  editRestaurantsOrUsers,
  resetPassword,
  logoutAdmin,
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

router.get("/get-admins", async (req, res) => {
  try {
    const data = await getAdmins(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Admins list fetched successfully.", ...data });
  } catch (error) {
    console.error("Error while getting the admins", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.post("/edit-admin", async (req, res) => {
  try {
    const msg = await editAdmin(req);
    return res.status(STATUS_CODES.OK).json(msg);
  } catch (error) {
    console.error("Error while editiing the admin", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.get("/get-users", async (req, res) => {
  try {
    const { users, totalCount } = await getUsers(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Users list fetched successfully.", users, totalCount });
  } catch (error) {
    console.error("Error while getting the users", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.get("/get-restaurants", async (req, res) => {
  try {
    const { entity, totalCount } = await getRestaurants(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Restaurants list fetched successfully.",
      entity,
      totalCount,
    });
  } catch (error) {
    console.error("Error while getting the restaurants", error);

    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || "Error while getting the restaurants",
    });
  }
});

router.get("/get-restaurants-orders", async (req, res) => {
  try {
    const data = await getRestaurantOrders(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Restaurants orders and revenue fetched successfully.",
      ...data,
    });
  } catch (error) {
    console.error("Error while getting the restaurants", error);

    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || "Error while getting the restaurants",
    });
  }
});

router.get("/get-transaction-logs", async (req, res) => {
  try {
    const data = await getTransactionLogs(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Transaction logs fetched successfully.",
      ...data,
    });
  } catch (error) {
    console.error("Error while fetching the transaction logs:", error);

    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || "Error while fetching the transaction logs",
    });
  }
});

router.get("/get-admin-user-details", async (req, res) => {
  try {
    const data = await getAdminUserDetails(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Admin details fetched successfully.",
      data,
    });
  } catch (error) {
    console.error("Error while fetching the admin details:", error);

    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || "Error while fetching the admin details",
    });
  }
});

router.get("/get-dashboard-analytics", async (req, res) => {
  try {
    const data = await getDashboardAnalytics(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Analytics fetched successfully.",
      ...data,
    });
  } catch (error) {
    console.error("Error while fetching the analytics:", error);

    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || "Error while fetching the analytics",
    });
  }
});

router.post("/edit-restaurants-or-users", async (req, res) => {
  try {
    const data = await editRestaurantsOrUsers(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Restaurant updated successfully.",
      ...data,
    });
  } catch (error) {
    console.error("Error while updating the restaurants or users:", error);

    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || "Error while updating the restaurants or users",
    });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    await resetPassword(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Password updated successfully.",
    });
  } catch (error) {
    console.error("Error while resetting the password:", error);

    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || "Error while resetting the password",
    });
  }
});

router.post("/logout-admin", async (req, res) => {
  try {
    const response = await logoutAdmin(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Admin logged out sucessfully.", response });
  } catch (error) {
    console.error("Error while logging out the admin: ", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while logging out the admin" });
  }
});

module.exports = router;
