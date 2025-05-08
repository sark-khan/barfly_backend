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
  particularOrderDetailsCustomer,
  getEventOrderSummary,
  createOfflineOrder,
  getOfflineOrders,
  updateOfflineOrders,
} = require("../CustomerServices/orderService");

const { STATUS_CODES } = require("../Utils/globalConstants");

const verifyToken = require("../Utils/verifyToken");
const { orderSocket } = require("../server");
const { io } = require("../app");
const User = require("../Models/User");

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
    console.log({ response });
    io.to(response.entityId.toString()).emit("newOrder");

    // const userDetails = await User.findById(req.userId, { socketId: 1 });
    // if (userDetails && userDetails.socketId) {

    // io.to(req.userId.toString()).emit("newOrder", response);
    // }

    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Order created successfully.", response });
  } catch (error) {
    console.error("Error while adding order", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while adding order" });
  } finally {
    session.endSession();
  }
});

router.post("/create-offline-order", async (req, res) => {
  try {
    const response = await createOfflineOrder(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Order logs created successfully.", response });
  } catch (error) {
    console.error("Error while creating order logs:", error);
    return res
      .status(STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while creating order logs" });
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
    const {
      data,
      orderProcessCount,
      readyOrders,
      completedOrders,
      cancelledOrders,
    } = await getEntityOrders(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Orders fetched successfully.",
      data,
      orderProcessCount,
      readyOrders,
      completedOrders,
      cancelledOrders,
    });
  } catch (error) {
    console.error("Error while fetching orders", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while fetching orders" });
  }
});

router.get("/get-offline-orders", async (req, res) => {
  try {
    const { data, preparing, readyOrders, completedOrders } =
      await getOfflineOrders(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Offline orders fetched successfully.",
      data,
      preparing,
      readyOrders,
      completedOrders,
    });
  } catch (error) {
    console.error("Error while fetching offline orders", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || "Error while fetching offline orders",
    });
  }
});

router.post("/update-offline-status-of-order", async (req, res) => {
  try {
    await updateOfflineOrders(req);
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

router.get("/get-particular-live-order-details", async (req, res) => {
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

router.get("/get-particular-live-order-details-customer", async (req, res) => {
  try {
    const particularLiveOrder = await particularOrderDetailsCustomer(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Orders fetched successfully.", particularLiveOrder });
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

router.get("/get-event-order-summary", async (req, res) => {
  try {
    const data = await getEventOrderSummary(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Revenue generated successfully.", data });
  } catch (error) {
    console.error("Error while generating the revenue", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while generating the revenue" });
  }
});

module.exports = router;
