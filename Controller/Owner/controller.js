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
  getOrderDetailsOfEvents,
  createDiscountCoupon,
  getDiscountCoupon,
  editBusinessDetails,
  getBusinessUserDetails,
  addingTables,
  getTables,
  getUsersFeedback,
  addFeedbackQuestions,
  getCounters,
  emailExist,
  restaurantOpen,
  deleteEntityAccount,
} = require("./service");
const verifyToken = require("../../Utils/verifyToken");
const Counter = require("../../Models/Counter");
const multer = require("multer");
const ItemDetails = require("../../Models/ItemDetails");
const MenuItem = require("../../Models/MenuItem");
const { addExistingItemToMenu } = require("../Customer/service");
const MenuCategory = require("../../Models/MenuCategory");
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
// router.use(verifyToken);
// router.use((req, res, next) => {
//   if (req.role != ROLES.STORE_OWNER) {
//     return res
//       .status(STATUS_CODES.NOT_AUTHORIZED)
//       .json({ message: "Only Owner can perform this action" });
//   }
//   return next();
// });

router.post("/create-counter", async (req, res) => {
  try {
    const response = await createCounter(req);
    return res.status(STATUS_CODES.OK).json({
      message: `${response.counterName} created successfully`,
      data: response.counterName,
    });
  } catch (error) {
    console.error("Error while creating Menu", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
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
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.post("/create-counter-menu-category", async (req, res) => {
  try {
    const response = await createCounterMenuCategory(req);
    return res.status(STATUS_CODES.OK).json({
      message: `Counter menu category created successfully`,
      data: response,
    });
  } catch (error) {
    console.error("Error while creating counter category", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.get("/get-counter", async (req, res) => {
  try {
    const counter = await getCounters(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Counters fetched succesfully.", data: counter });
  } catch (error) {
    console.error("Error while getting counters:", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while getting counters" });
  }
});

router.get("/get-menu-category", async (req, res) => {
  try {
    const menuCategory = await getMenuCategory(req);
    return res.status(STATUS_CODES.OK).json({
      message: `Menu category fetched successfully`,
      data: menuCategory,
    });
  } catch (error) {
    console.error("Error while fetching menu category", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
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
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
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
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.post("/create-menu-items", upload.single("file"), async (req, res) => {
  try {
    const newItem = await createMenuItem(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Item created successfully",
      data: newItem,
    });
  } catch (error) {
    console.error("Error while creating items: ", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Failed to create item" });
  }
});

// router.post("/create-items", upload.single("file"), async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(STATUS_CODES.BAD_REQUEST).send("No file uploaded.");
//     }
//     const newItem = await createItems(req);
//     return res.status(STATUS_CODES.OK).json({
//       message: "Item created successfully",
//       data: newItem,
//     });
//   } catch (error) {
//     console.error("Error while creating items: ", error);
//     return res
//       .status(error.status || 500)
//       .json({ message: error.message || "Error while creating items:" });
//   }
// });

router.get("/get-entity-items", async (req, res) => {
  try {
    const response = await getCreatedItems(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Items fetch succesfully",
      data: response,
    });
  } catch (error) {
    console.error("Error while getting items: ", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while getting items" });
  }
});

router.post("/update-menu-item", upload.single("file"), async (req, res) => {
  try {
    await updateMenuItem(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Items updated succesfully",
    });
  } catch (error) {
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.get("/update-entity-items", async (req, res) => {
  try {
    const itemsId = await ItemDetails.find({ entityId: req.entityId }).lean();

    for (const item of itemsId) {
      await MenuItem.updateOne(
        { _id: item.itemId }, // Filter by itemId
        { $set: { price: item.price, currency: "CHF" } }
      );
    }
    return res.status(200).json({ message: "Updated all the doc" });
  } catch (error) {
    console.log({ error });
    return res.status(200).json({ message: error });
  }
});

router.get("/get-menu-particular-item", async (req, res) => {
  try {
    const response = await getParticularItemDetail(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Items fetch succesfully",
      particularItemDetails: response,
    });
  } catch (error) {
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.post("/create-event", upload.single("file"), async (req, res) => {
  try {
    const response = await createEvent(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Event succesfully created", data: response });
  } catch (error) {
    console.error({ error, message: "Error occured in create event" });
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
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
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
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
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
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
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.get("/get-past-events-by-month", async (req, res) => {
  try {
    const response = await getEventsByMonthAndYear(req);

    // if (!response.length) {
    //   return res
    //     .status(STATUS_CODES.OK)
    //     .json({ message: `No events found for ${month}/${year}` });
    // }
    return res.status(STATUS_CODES.OK).json({
      message: "Past events successfully fetched",
      data: response,
    });
  } catch (error) {
    console.error("Error while getting past events:", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
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
    console.error("Error occured while fetching the monthly event details");
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
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
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
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
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.post("/update-counter-settings", async (req, res) => {
  try {
    const counterSettings = await updateCounterSettings(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Counter updated successfully.",
      counterSettings,
    });
  } catch (error) {
    console.error("Error occured while fetching counter list quantity", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
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
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.post("/create-discount-coupon", async (req, res) => {
  try {
    await createDiscountCoupon(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Discount coupon created successfully",
    });
  } catch (error) {
    console.error("Error occured while creating discount coupon", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.post("/get-discount-coupons", async (req, res) => {
  try {
    await getDiscountCoupon(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Discount coupons fetched successfully",
    });
  } catch (error) {
    console.error("Error occured while fetching discount coupons", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

// const mongoose = require("mongoose");
// const express = require("express");
// const router = express.Router();
// const MenuCategory = require("../models/MenuCategory");
// const ItemDetails = require("../models/ItemDetails");

router.get("/get-counters-by-name", async (req, res) => {
  try {
    const {
      entityId,
      query: { categoryName, itemName }, // Added itemName to query params
    } = req;

    if (!categoryName) {
      return res.status(400).json({
        message: "Category name is required.",
      });
    }

    if (!itemName) {
      return res.status(400).json({
        message: "Item name is required.",
      });
    }

    const menuCategories = await MenuCategory.find({ categoryName, entityId })
      .populate({
        path: "counterId",
        select: "counterName",
      })
      .lean();

    if (!menuCategories.length) {
      return res.status(404).json({
        message: "No menu categories found with this name.",
      });
    }

    const menuCategoryIds = menuCategories.map((cat) => cat._id);

    const existingItems = await ItemDetails.find({
      menuCategoryId: { $in: menuCategoryIds },
      itemName,
    }).select("menuCategoryId");

    const menuCategoryIdsWithItem = new Set(
      existingItems.map((item) => item.menuCategoryId.toString())
    );

    const filteredCounters = menuCategories
      .filter(
        (cat) =>
          cat.counterId && !menuCategoryIdsWithItem.has(cat._id.toString())
      )
      .map((cat) => ({
        counterId: cat.counterId._id.toString(),
        counterName: cat.counterId.counterName,
      }));

    return res.status(STATUS_CODES.OK).json({ counters: filteredCounters });
  } catch (error) {
    console.error("Error fetching counters by category name:", error);
    res.status(SERVER_ERROR).json({
      message: "An error occurred while fetching counters.",
    });
  }
});

router.post(
  "/edit-business-details",
  upload.single("file"),
  async (req, res) => {
    try {
      await editBusinessDetails(req);
      return res
        .status(STATUS_CODES.OK)
        .json({ message: "Business details updated successfully." });
    } catch (error) {
      console.error("Error while updating the details", error);
      return res
        .status(STATUS_CODES.SERVER_ERROR)
        .json({ message: error.message });
    }
  }
);

router.get("/get-business-user-details", async (req, res) => {
  try {
    const response = await getBusinessUserDetails(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Business details updated successfully.", response });
  } catch (error) {
    console.error("Error while updating the details", error);
    return res
      .status(STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.post("/adding-tables", async (req, res) => {
  try {
    await addingTables(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Tables added successfully." });
  } catch (error) {
    console.error("Error while adding the tables details", error);
    return res
      .status(STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.get("/get-tables", async (req, res) => {
  try {
    const data = await getTables(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Tables fetched successfully.", data });
  } catch (error) {
    console.error("Error while fetching the tables details", error);
    return res
      .status(STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.get("/get-feedbacks-from users", async (req, res) => {
  try {
    const data = await getUsersFeedback(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Users feedback fetched successfully.", data });
  } catch (error) {
    console.error("Error while fetching the users feedback details", error);
    return res
      .status(STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.post("/add-feedback-questions", async (req, res) => {
  try {
    await addFeedbackQuestions(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Feedback questions added successfully." });
  } catch (error) {
    console.error("Error while adding the feedback questions.", error);
    return res
      .status(STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.post("/restaurant-open", async (req, res) => {
  try {
    await restaurantOpen(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Restaurant updated successfully." });
  } catch (error) {
    console.error("Error while updating the restaurant.", error);
    return res
      .status(STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.get("/email-exist", async (req, res) => {
  try {
    const data = await emailExist(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Emails fetched successfully.", data });
  } catch (error) {
    console.error("Error while fetching the emails.", error);
    return res
      .status(STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.post("/delete-entity-account", async (req, res) => {
  try {
    await deleteEntityAccount(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Entity account deleted successfully." });
  } catch (error) {
    console.error("Error while deleting the account: ", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while deleting the account." });
  }
});

module.exports = router;
