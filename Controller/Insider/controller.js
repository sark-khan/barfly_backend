const express = require("express");
const router = express.Router();
const { STATUS_CODES } = require("../../Utils/globalConstants");
const {
  createInsider,
  createMenu,
  getItemsOfMenu,
  getMenuOfInsider,
  createEvent,
  getUpcomingEvents,
  getDistinctMonthsAndYears,
  getEventsByMonthAndYear,
} = require("./service");
const verifyToken = require("../../Utils/verifyToken");
const Insider = require("../../Models/Insider");

router.use(verifyToken);
router.use((req, res, next) => {
  if (req.role != "Owner") {
    return res
      .status(STATUS_CODES.NOT_AUTHORIZED)
      .json({ message: "Only Owner can perform this action" });
  }
  return next();
});

router.post("/insider", async (req, res) => {
  try {
    const response = await createInsider(req);
    return res.status(STATUS_CODES.OK).json({
      message: `${response.insiderName} created successfully`,
      data: response,
    });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.get("/get-insider", async (req, res) => {
  try {
    const insiders = await Insider.find(
      { ownerId: req.id },
      { insiderName: 1, hasBar: 1, hasLounge: 1, hasFeedback: 1, updatedAt: 1 }
    ).sort({ updatedAt: -1 });
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Insiders succesfully fetched", data: insiders });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.post("/create-menu-of-insider", async (req, res) => {
  try {
    const response = await createMenu(req);
    return res.status(STATUS_CODES.OK).json({
      message: `Menu created successfully`,
      data: response,
    });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.get("/get-menu-of-insider", async (req, res) => {
  try {
    const response = await getMenuOfInsider(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Menu succesfully fetched", data: response });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.get("/get-items-of-menu", async (req, res) => {
  try {
    const response = await getItemsOfMenu(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Items succesfully fetched", data: response });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.post("/create-items-of-menu", async (req, res) => {
  try {
    const response = await getItemsOfMenu(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Items succesfully fetched", data: response });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.post("/create-event", async (req, res) => {
  try {
    const response = await createEvent(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Event succesfully created", data: response });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.get("/get-upcoming-events", async (req, res) => {
  try {
    const response = await getUpcomingEvents(req);
    if (!response.length) {
      return res
        .status(STATUS_CODES.OK)
        .json({ message: "No upcoming events found" });
    }
    return res.status(STATUS_CODES.OK).json({
      message: "Upcoming events successfully fetched",
      data: response,
    });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.get("/get-past-events-months", async (req, res) => {
  try {
    const response = await getDistinctMonthsAndYears(req);
    if (!response.length) {
      return res
        .status(STATUS_CODES.OK)
        .json({ message: "No past events found" });
    }
    return res.status(STATUS_CODES.OK).json({
      message: "Past event months and years successfully fetched",
      data: response,
    });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.get("/get-past-events-by-month", async (req, res) => {
  const { month, year } = req.query;
  if (!month || !year) {
    return res
      .status(STATUS_CODES.BAD_REQUEST)
      .json({ message: "Month and year are required" });
  }

  try {
    const response = await getEventsByMonthAndYear(Number(month), Number(year));
    if (!response.length) {
      return res
        .status(STATUS_CODES.OK)
        .json({ message: `No events found for ${month}/${year}` });
    }
    return res.status(STATUS_CODES.OK).json({
      message: "Past events successfully fetched",
      data: response,
    });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});

module.exports = router;
