const express = require("express");
const router = express.Router();
const { STATUS_CODES, ROLES } = require("../../Utils/globalConstants");
const {
  // addFavouriteEntity,
  getFavouriteEvents,
  removeFavouriteEvents,
  visitorCount,
  getEntities,
  counterList,
  getCounterMenuCategory,
  getMenuItems,
  eventOpened,
  eventClosed,
  updateFavouriteItem,
  getFavouriteItems,
  getUserCards,
  editOrDeleteCards,
  getUserDetails,
  updateUserDetails,
  addCards,
  processLocationForUser,
  addFavouriteEntity,
  userFeedback,
  getAllcountries,
  getCitiesOfStates,
  getCountryByIsoCode,
  getRecommendedItems,
  createSearchLogs,
  getSearchLogs,
  removeLogs,
  newlyAddedEntities,
  popularEntities,
  entityOffers,
} = require("./service");

// router.use((req, res, next) => {
//   if (req.role != ROLES.CUSTOMER) {
//     return res
//       .status(STATUS_CODES.NOT_AUTHORIZED)
//       .json({ message: "Only Customer can perform this action" });
//   }
//   return next();
// });

router.get("/get-entities", async (req, res) => {
  try {
    const response = await getEntities(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Events successfully fetched",
      entityEvents: response,
    });
  } catch (error) {
    console.error("Error occured while getting Entiities", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.post("/event-opened", async (req, res) => {
  try {
    await eventOpened(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Active users increased" });
  } catch (error) {
    console.error("Error while event opened api", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.post("/event-closed", async (req, res) => {
  try {
    await eventClosed(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Active users reduced" });
  } catch (error) {
    console.error("Error while event opened api", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.post("/add-favourite-entity", async (req, res) => {
  try {
    await addFavouriteEntity(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Favourite event added" });
  } catch (error) {
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

// router.get("/get-favourite-entity", async (req, res) => {
//   try {
//     const response = await getFavouriteEvents(req);
//     return res.status(STATUS_CODES.OK).json({
//       message: "Favourite events successfully fetched",
//       data: response,
//     });
//   } catch (error) {
//     return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({ message: error.message });
//   }
// });

router.get("/counter-list-items", async (req, res) => {
  try {
    await addFavouriteEntity(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Favourite event added" });
  } catch (error) {
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});
// router.put("/remove-favourite-events", async (req, res) => {
//   try {
//     await removeFavouriteEvents(req);
//     return res.status(STATUS_CODES.OK).json({
//       message: "Favourite events removed successfully",
//     });
//   } catch (error) {
//     return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({ message: error.message });
//   }
// });

router.post("/visitor-count", async (req, res) => {
  try {
    await visitorCount(req);
    return res.status(STATUS_CODES.OK).json({
      message: "",
    });
  } catch (error) {
    console.error("Error occured while incrementing visitor count", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.post("/add-existing-item", async (req, res) => {
  try {
    await addExisitngItem(req);
    return res.status(STATUS_CODES.OK).json({
      message: "",
    });
  } catch (error) {
    console.error("Error occured while incrementing visitor count", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.get("/get-counter-list", async (req, res) => {
  try {
    const counterLists = await counterList(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Counter List fetched",
      counterLists,
    });
  } catch (error) {
    console.error("Error occured while get counter list", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.get("/get-counter-menu-category", async (req, res) => {
  try {
    const menuLists = await getCounterMenuCategory(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Menu Categories Fetched",
      menuLists,
    });
  } catch (error) {
    console.error("Error occured while getting counter category", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.get("/get-menu-category-items", async (req, res) => {
  try {
    const menuItems = await getMenuItems(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Menu items fetched successfully.",
      menuItems,
    });
  } catch (error) {
    console.error("Error occured while getting menu items", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.get("/recommended-items", async (req, res) => {
  try {
    const items = await getRecommendedItems(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Recommended items fetched successfully.",
      menuItems: items,
    });
  } catch (error) {
    console.error("Error occured while getting recommended items", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.post("/update-language", async (req, res) => {
  try {
    await getMenuItems(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Language Updated",
    });
  } catch (error) {
    console.error("Error occured while updating language", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.post("/update-favourite-items", async (req, res) => {
  try {
    await updateFavouriteItem(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Favourite updated",
    });
  } catch (error) {
    console.error("Error occured while updating favourites list", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.get("/get-favourite-items", async (req, res) => {
  try {
    const menuItems = await getFavouriteItems(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Favourite item fetched successfully",
      menuItems,
    });
  } catch (error) {
    console.error("Error occured while fetching favourite items", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

router.post("/add-card", async (req, res) => {
  try {
    await addCards(req);
    return res.status(STATUS_CODES.OK).json({
      message: " Card added successfully.",
    });
  } catch (error) {
    console.error("Error occured while adding card details: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || "Error occured while adding card details.",
    });
  }
});

router.get("/get-user-cards", async (req, res) => {
  try {
    const cards = await getUserCards(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Cards fetched successfully.",
      cards,
    });
  } catch (error) {
    console.error("Error occured while getting card details: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || "Error occured while getting card details.",
    });
  }
});

router.post("/edit-card", async (req, res) => {
  try {
    const message = await editOrDeleteCards(req);
    return res.status(STATUS_CODES.OK).json({ message });
  } catch (error) {
    console.error("Error while updating details of card: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || "Error while updating details of card",
    });
  }
});

router.get("/get-user-details", async (req, res) => {
  try {
    const response = await getUserDetails(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "User details fetched successfully.", response });
  } catch (error) {
    console.error("Error while fetching user details: ", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while fetching user details." });
  }
});

router.post("/update-user-details", async (req, res) => {
  try {
    const message = await updateUserDetails(req);
    return res.status(STATUS_CODES.OK).json({ message });
  } catch (error) {
    console.error("Error while updating user details: ", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while updating user details." });
  }
});

router.post("/location", async (req, res) => {
  try {
    const result = await processLocationForUser(req);
    res
      .status(STATUS_CODES.OK)
      .json({ message: "Location fetched successfully.", result });
  } catch (error) {
    console.error("Error while finding the location: ", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while finding the location" });
  }
});

router.post("/user-feedback", async (req, res) => {
  try {
    const response = await userFeedback(req);
    res
      .status(STATUS_CODES.OK)
      .json({ message: "Feedback submitted successfully.", data: response });
  } catch (error) {
    console.error("Error while submitting the feedabck: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || "Error while submitting the feedabck",
    });
  }
});

router.get("/get-all-countries", async (req, res) => {
  try {
    const { data } = getAllcountries();
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Countries fetched successfully.", data });
  } catch (error) {
    console.error("Error while fetching countries: ", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while fetching countries." });
  }
});

router.get("/get-cities-of-state", async (req, res) => {
  try {
    const cities = await getCitiesOfStates(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Cities fetched successfully.", cities });
  } catch (error) {
    console.error("Error while fetching cities: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || "Error while fetching cities",
    });
  }
});

router.get("/get-iso-code", async (req, res) => {
  try {
    const { data } = await getCountryByIsoCode({ req });
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Iso code fetched successfully.", stateList: data });
  } catch (error) {
    console.error("Error while fetching iso code: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || "Error while fetching iso code",
    });
  }
});

router.post("/create-search-logs", async (req, res) => {
  try {
    await createSearchLogs(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Logs created successfully." });
  } catch (error) {
    console.error("Error while creating logs: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || "Error while creating logs",
    });
  }
});

router.get("/get-search-logs", async (req, res) => {
  try {
    const searchedEntitiesLogs = await getSearchLogs(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Logs fetched successfully.", searchedEntitiesLogs });
  } catch (error) {
    console.error("Error while fetched logs: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || "Error while fetched logs",
    });
  }
});

router.post("/remove-search-logs", async (req, res) => {
  try {
    const data = await removeLogs(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Logs fetched successfully.", data });
  } catch (error) {
    console.error("Error while fetched logs: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || "Error while fetched logs",
    });
  }
});

router.get("/newly-added-entities", async (req, res) => {
  try {
    const data = await newlyAddedEntities();
    return res.status(STATUS_CODES.OK).json({
      message: "Newly added entities fetched successfully.",
      data,
    });
  } catch (error) {
    console.error("Error occured while getting newly added entities: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message:
        error.message || "Error occured while getting newly added entities.",
    });
  }
});

router.get("/popular-entities", async (req, res) => {
  try {
    const data = await popularEntities();
    return res.status(STATUS_CODES.OK).json({
      message: "Popular entities fetched successfully.",
      data,
    });
  } catch (error) {
    console.error("Error occured while getting popular entities: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || "Error occured while getting popular entities.",
    });
  }
});

router.get("/entity-offers", async (req, res) => {
  try {
    const data = await entityOffers();
    return res.status(STATUS_CODES.OK).json({
      message: "Entities offers fetched successfully.",
      data,
    });
  } catch (error) {
    console.error("Error occured while getting entities offers: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || "Error occured while getting entities offers",
    });
  }
});

module.exports = router;
