const express = require("express");
const mongoose = require("mongoose");

const router = express.Router({ caseSensitive: true });

const {
  createOrder,
  updateStatusOfOrder,
  getEntityOrders,
  getOrderGroupByYears,
  getLiveOrdersUsers,
  particularOrderDetails,
  getOrderGroupByYearsForEntity,
  pastTicketYears,
  cancelOrder,
  getOrderGroupByMonths,
  getRestaurantOrdersAndCount,
} = require("../CustomerServices/orderService");

const { STATUS_CODES } = require("../Utils/globalConstants");

const verifyToken = require("../Utils/verifyToken");

// router.use(verifyToken);

router.use((req, res, next) => {
  req.userId = req.id;
  return next();
});

router.post("/create-order", async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let response;
    await session.withTransaction(async () => {
      response = await createOrder(req, session);
    });

    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Order create Successfully.", response });
  } catch (error) {
    console.error("Error while adding order", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while adding order" });
  } finally {
    session.endSession();
  }
});

router.post("/update-status-of-order", async (req, res) => {
  try {
    await updateStatusOfOrder(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Status of order updated successfully." });
  } catch (error) {
    console.error("Error while updating order status", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while updating order status" });
  }
});

router.get("/get-entity-orders", async (req, res) => {
  try {
    const { data, orderProcessCount, readyOrders, completedOrders } =
      await getEntityOrders(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Orders fetched successfully.",
      data,
      orderProcessCount,
      readyOrders,
      completedOrders,
    });
  } catch (error) {
    console.error("Error while fetching orders", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while fetching orders" });
  }
});

router.get("/get-users-restaurant-orders-count", async (req, res) => {
  try {
    const userOrders = await getRestaurantOrdersAndCount(req);
    return res.status(STATUS_CODES.OK).json({
      message: "User orders fetched successfully.",
      userOrders,
    });
  } catch (error) {
    console.error("Error while fetching user orders", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while fetching user orders" });
  }
});

router.get("/get-users-orders-group-by-years", async (req, res) => {
  try {
    const previosuOrdersList = await getOrderGroupByYears(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Orders fetched successfully.", previosuOrdersList });
  } catch (error) {
    console.error("Error while fetching orders", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while fetching orders" });
  }
});

router.get("/get-users-orders-group-by-months", async (req, res) => {
  try {
    const ordersByMonthAndEntity = await getOrderGroupByMonths(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Monthly orders fetched successfully.",
      ordersByMonthAndEntity,
    });
  } catch (error) {
    console.error("Error while fetching orders", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while fetching orders" });
  }
});

router.get("/get-entity-orders-group-by-years", async (req, res) => {
  try {
    const previosuOrdersList = await getOrderGroupByYearsForEntity(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Orders fetched successfully.", previosuOrdersList });
  } catch (error) {
    console.error("Error while fetching orders", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while fetching orders" });
  }
});

router.get("/get-live-orders-user", async (req, res) => {
  try {
    const liveOrders = await getLiveOrdersUsers(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Orders fetched successfully.", liveOrders });
  } catch (error) {
    console.error("Error while fetching orders", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while fetching orders" });
  }
});

router.get("/get-live-order-details", async (req, res) => {
  try {
    const liveOrders = await particularOrderDetails(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Orders fetched successfully.", liveOrders });
  } catch (error) {
    console.error("Error while fetching orders", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while fetching orders" });
  }
});

router.get("/get-past-ticket-years-customer", async (req, res) => {
  try {
    const pastTicketYearsData = await pastTicketYears(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Orders fetched successfully.", pastTicketYearsData });
  } catch (error) {
    console.error("Error while fetching orders", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while fetching orders" });
  }
});

router.post("/cancel-order", async (req, res) => {
  try {
    await cancelOrder(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Order cancelled successfully." });
  } catch (error) {
    console.error("Error while cancelling the order", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while cancelling the order" });
  }
});

module.exports = router;
