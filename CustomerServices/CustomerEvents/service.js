const Event = require("../../Models/Event");
const UserFavourites = require("../../Models/UserFavourites");
const STATUS_CODES = require("../../Utils/globalConstants");
const throwError = require("../../Utils/throwError");
const mongoose = require("mongoose");

module.exports.getEvents = async (req) => {
  const currentDateTime = new Date();

  const events = await Event.find({});
  const eventStatus = events.map((event) => {
    const status = event.date > currentDateTime ? "active" : "inactive";
    return { ...event.toObject(), status };
  });
  return eventStatus;
};

module.exports.addFavouriteEvents = async (req) => {
  const userId = req.id;
  const { favouritesEvents } = req.body;

  if (
    !Array.isArray(favouritesEvents) ||
    !favouritesEvents.every(mongoose.Types.ObjectId.isValid)
  ) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Invalid event ID",
    });
  }

  const events = await Event.find({ _id: { $in: favouritesEvents } });
  if (events.length !== favouritesEvents.length) {
    throwError({
      status: STATUS_CODES.NOT_FOUND,
      message: "One or more events not found",
    });
  }

  let userFavourites = await UserFavourites.findOne({ userId });

  if (!userFavourites) {
    userFavourites = new UserFavourites({
      userId,
      favouritesEvents: favouritesEvents,
    });
  } else {
    favouritesEvents.forEach((eventId) => {
      if (!userFavourites.favouritesEvents.includes(eventId)) {
        userFavourites.favouritesEvents.push(eventId);
      }
    });
  }

  await userFavourites.save();
  return userFavourites;
};

module.exports.getFavouriteEvents = async (req) => {
  const userId = req.id;
  const userFavourites = await UserFavourites.findOne({ userId }).populate(
    "favouritesEvents"
  );

  if (!userFavourites) {
    throwError({
      status: STATUS_CODES.NOT_FOUND,
      message: "No favourite events found for the user",
    });
  }

  return userFavourites.favouritesEvents;
};

module.exports.removeFavouriteEvents = async (req) => {
  const userId = req.id;
  const { favouritesEvents } = req.body;

  if (
    !Array.isArray(favouritesEvents) ||
    !favouritesEvents.every(mongoose.Types.ObjectId.isValid)
  ) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Invalid event ID(s)",
    });
  }

  let userFavourites = await UserFavourites.findOne({ userId });

  if (!userFavourites) {
    throwError({
      status: STATUS_CODES.NOT_FOUND,
      message: "No favourite events found for the user",
    });
  }

  userFavourites.favouritesEvents = userFavourites.favouritesEvents.filter(
    (eventId) => !favouritesEvents.includes(eventId.toString())
  );

  await userFavourites.save();

  const updatedEvents = await Event.find({
    _id: { $in: userFavourites.favouritesEvents },
  });

  return {
    userFavourites,
    updatedEvents,
  };
};
