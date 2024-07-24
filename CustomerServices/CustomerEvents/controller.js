const express = require("express");
const router = express.Router();
const { STATUS_CODES, ROLES } = require("../../Utils/globalConstants");
const {
  addFavouriteEvents,
  getFavouriteEntity,
  removeFavouriteEvents,
  visitorCount,
  getEntities,
  searchEntity
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
    await addFavouriteEvents(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Favourite event added" });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.get("/get-favourite-entity", async (req, res) => {
  try {
    const response = await getFavouriteEntity(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Favourite events successfully fetched",
      data: response,
    });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.put("/remove-favourite-events", async (req, res) => {
  try {
    await removeFavouriteEvents(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Favourite events removed successfully",
    });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.post("/visitor-count", async (req, res) => {
  try {
    await visitorCount(req);
    return res.status(STATUS_CODES.OK).json({
      message: "",
    });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.get("/search-entity", async (req, res) => {
  try {
    const response = await searchEntity(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Favourite events successfully fetched",
      data: response,
    });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});

module.exports = router;
