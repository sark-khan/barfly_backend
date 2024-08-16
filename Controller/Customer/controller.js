const express = require("express");
const router = express.Router();
const { STATUS_CODES, ROLES } = require("../../Utils/globalConstants");
const {
  addFavouriteEntity,
  getFavouriteEvents,
  removeFavouriteEvents,
  visitorCount,
  getEntities,
  counterList,
  getMenuSubCategory,
  getMenuItems,
} = require("./service");
const verifyToken = require("../../Utils/verifyToken");

router.use(verifyToken);
router.use((req, res, next) => {
  if (req.role != ROLES.CUSTOMER) {
    return res
      .status(STATUS_CODES.NOT_AUTHORIZED)
      .json({ message: "Only Customer can perform this action" });
  }
  return next();
});

router.get("/get-entities", async (req, res) => {
  try {
    const response = await getEntities(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Events successfully fetched",
      entityEvents: response,
    });
  } catch (error) {
    console.error("Error occured while getting Entiities", error);
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.post("/add-favourite-entity", async (req, res) => {
  try {
    await addFavouriteEntity(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Favourite event added" });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
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
//     return res.status(error.status || 400).json({ message: error.message });
//   }
// });

router.get("/counter-list-items", async (req, res) => {
  try {
    await addFavouriteEntity(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Favourite event added" });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});
// router.put("/remove-favourite-events", async (req, res) => {
//   try {
//     await removeFavouriteEvents(req);
//     return res.status(STATUS_CODES.OK).json({
//       message: "Favourite events removed successfully",
//     });
//   } catch (error) {
//     return res.status(error.status || 400).json({ message: error.message });
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
    return res.status(error.status || 400).json({ message: error.message });
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
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.get("/get-counter-menu-category", async (req, res) => {
  try {
    const menuLists = await getMenuSubCategory(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Menu Categories Fetched",
      menuLists,
    });
  } catch (error) {
    console.error("Error occured while getting counter category", error);
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.get("/get-menu-category-items", async (req, res) => {
  try {
    const menuItems = await getMenuItems(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Menu Categories Fetched",
      menuItems,
    });
  } catch (error) {
    console.error("Error occured while getting menu items", error);
    return res.status(error.status || 400).json({ message: error.message });
  }
});

module.exports = router;
