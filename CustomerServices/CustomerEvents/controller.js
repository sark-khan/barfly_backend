const express = require("express");
const router = express.Router();
const { STATUS_CODES, ROLES } = require("../../Utils/globalConstants");
const {
  getEvents,
  addFavouriteEvents,
  getFavouriteEvents,
  removeFavouriteEvents,
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

router.get("/get-events", async (req, res) => {
  try {
    const response = await getEvents();
    if (!response.length) {
      return res.status(STATUS_CODES.OK).json({ message: "No events found" });
    }
    return res.status(STATUS_CODES.OK).json({
      message: "Events successfully fetched",
      data: response,
    });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.post("/add-favourite-events", async (req, res) => {
  try {
    const response = await addFavouriteEvents(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Favourite event added", data: response });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.get("/get-favourite-events", async (req, res) => {
  try {
    const response = await getFavouriteEvents(req);
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
    const { userFavourites, updatedEvents } = await removeFavouriteEvents(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Favourite events removed successfully",
      userFavourites,
      updatedEvents,
    });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});

module.exports = router;
