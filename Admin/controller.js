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
    const data = await getUsers(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Users list fetched successfully.", data });
  } catch (error) {
    console.error("Error while getting the users", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.get("/get-restaurants", async (req, res) => {
  try {
    const data = await getRestaurants(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Restaurants fetched successfully.", data });
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
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Restaurants fetched successfully.", data });
  } catch (error) {
    console.error("Error while getting the restaurants", error);

    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || "Error while getting the restaurants",
    });
  }
});

module.exports = router;
