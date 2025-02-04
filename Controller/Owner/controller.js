const express = require("express");
const router = express.Router();
const { STATUS_CODES, ROLES } = require("../../Utils/globalConstants");
const {
  getUpcomingEvents,
  getEventsByMonthAndYear,
  createMenuItem,
  getCreatedItems,
  createCounter,
  createCounterMenuCategory,
  getMenuCategory,
  getMenuCategoryItems,
  getCounterMenuQuantites,
  updateCounterSettings,
  getCounterSettings,
  createEvent,
  getParticularItemDetail,
  updateMenuItem,
  getDistinctMonthsOfYear,
  getMonthlyEventDetails,
  getOngoingEventDetails,
  getDistinctYears,
  createItems,
  getOrderDetailsOfEvents
} = require("./service");
const verifyToken = require("../../Utils/verifyToken");
const Counter = require("../../Models/Counter");
const multer = require("multer");
const ItemDetails = require("../../Models/ItemDetails");
const MenuItem = require("../../Models/MenuItem");
const { addExistingItemToMenu } = require("../Customer/service");
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
router.use(verifyToken);
router.use((req, res, next) => {
  if (req.role != ROLES.STORE_OWNER) {
    return res
      .status(STATUS_CODES.NOT_AUTHORIZED)
      .json({ message: "Only Owner can perform this action" });
  }
  return next();
});

router.post("/create-counter-with-settings", async (req, res) => {
  try {
    const response = await createCounter(req);
    return res.status(STATUS_CODES.OK).json({
      message: `${response.counterName} created successfully`,
      data: response,
    });
  } catch (error) {
    console.error("Error while creating Menu", error);
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.post("/add-existing-item-to-menu", async (req, res) => {
  try {
    await addExistingItemToMenu(req);
    return res.status(STATUS_CODES.OK).json({
      message: `Item added to category successfully`,
    });
  } catch (error) {
    console.error("Error while adding item to category", error);
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.post("/create-counter-menu-category", async (req, res) => {
  try {
    const response = await createCounterMenuCategory(req);
    return res.status(STATUS_CODES.OK).json({
      message: `Counter menu category successfully`,
      data: response,
    });
  } catch (error) {
    console.error("Error while creating menu category", error);
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.get("/get-counter", async (req, res) => {
  try {
    const counter = await Counter.find(
      { ownerId: req.id },
      { counterName: 1, updatedAt: 1 }
    ).sort({ updatedAt: -1 });
    console.log({ counter });
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Counter succesfully fetched", counter });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.get("/get-menu-category", async (req, res) => {
  try {
    const menuCategory = await getMenuCategory(req);
    return res.status(STATUS_CODES.OK).json({
      message: `Menu category fetched successfully`,
      menuCategory,
    });
  } catch (error) {
    console.error("Error while fetching menu category", error);
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.get("/get-menu-category-items", async (req, res) => {
  try {
    const menuCategoryItems = await getMenuCategoryItems(req);
    return res.status(STATUS_CODES.OK).json({
      message: `Menu Items fetched successfully`,
      menuCategoryItems,
    });
  } catch (error) {
    console.error("Error while fetching menu items", error);
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.get("/get-order-details-of-events", async (req, res) => {
  try {
    const orderDetailsOfEvents = await getOrderDetailsOfEvents(req);
    return res.status(STATUS_CODES.OK).json({
      message: `Order details fetched successfully`,
      orderDetailsOfEvents,
    });
  } catch (error) {
    console.error("Error while fetching oreder Details", error);
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.post("/create-menu-items", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("No file uploaded.");
    }
    const newItem = await createMenuItem(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Item created successfully",
      data: newItem,
    });
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Failed to create item" });
  }
});

router.post("/create-items", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("No file uploaded.");
    }
    const newItem = await createItems(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Item created successfully",
      data: newItem,
    });
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Failed to create item" });
  }
});

router.get("/get-entity-items", async (req, res) => {
  try {
    const response = await getCreatedItems(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Items fetch succesfully",
      entityItems: response,
    });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.get("/update-entity-items", async (req, res) => {
  try {
    const itemsId = await ItemDetails.find({ entityId: req.entityId }).lean();
  console.log("Reached here");
  console.log({ itemsId });

  // Loop through each item in itemsId and update the corresponding MenuItem
  for (const item of itemsId) {
    // Update each MenuItem with the corresponding price from ItemDetails
    await MenuItem.updateOne(
      { _id: item.itemId }, // Filter by itemId
      { $set: { price: item.price, currency: "CHF" } } // Set price and currency
    );
  }
    return res.status(200).json({ message: "Updated all the doc" })
  }
  catch (error) {
    console.log({error})
    return res.status(200).json({ message: error })
  }

})

router.get("/get-menu-particular-item", async (req, res) => {
  try {
    const response = await getParticularItemDetail(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Items fetch succesfully",
      particularItemDetails: response,
    });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});
router.post("/update-menu-item", async (req, res) => {
  try {
    await updateMenuItem(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Items updated succesfully",
    });
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
    console.error({ error, message: "Error occured in create event" });
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.get("/get-upcoming-events", async (req, res) => {
  try {
    const upcomingEvents = await getUpcomingEvents(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Upcoming events successfully fetched",
      upcomingEvents,
    });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.get("/get-past-events-years", async (req, res) => {
  try {
    const pastEventsYear = await getDistinctYears(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Past event months and years successfully fetched",
      pastEventsYear,
    });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.get("/get-past-events-year-month", async (req, res) => {
  try {
    const pastEventsMonths = await getDistinctMonthsOfYear(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Past event months and years successfully fetched",
      pastEventsMonths,
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

router.get("/get-event-details-monthly", async (req, res) => {
  try {
    const monthlyEventDetails = await getMonthlyEventDetails(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Past event months and years successfully fetched",
      monthlyEventDetails,
    });
  } catch (error) {
    console.error("Error occured while fetching the monthly event details")
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.get("/get-ongoing-event-details", async (req, res) => {
  try {
    const ongoingEventDetails = await getOngoingEventDetails(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Ongoing events fetched",
      ongoingEventDetails,
    });
  } catch (error) {
    console.error("Error occured in ongoing event details", error);
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.get("/get-counter-list-quantity", async (req, res) => {
  try {
    const counterListQuantity = await getCounterMenuQuantites(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Counter List quantity fetcched successfully",
      counterListQuantity,
    });
  } catch (error) {
    console.error("Error occured while fetching counter list quantity", error);
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.post("/update-counter-settings", async (req, res) => {
  try {
    const counterSettings = await updateCounterSettings(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Counter Settings Updated",
      counterSettings,
    });
  } catch (error) {
    console.error("Error occured while fetching counter list quantity", error);
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.get("/get-counter-settings", async (req, res) => {
  try {
    const counterSettings = await getCounterSettings(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Counter List quantity fetcched successfully",
      counterSettings,
    });
  } catch (error) {
    console.error("Error occured while fetching counter list quantity", error);
    return res.status(error.status || 400).json({ message: error.message });
  }
});

module.exports = router;
