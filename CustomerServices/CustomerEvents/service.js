const Event = require("../../Models/Event");
const UserFavourites = require("../../Models/UserFavourites");
const STATUS_CODES = require("../../Utils/globalConstants");
const throwError = require("../../Utils/throwError");
const mongoose = require("mongoose");

module.exports.getEvents = async (req) => {
  const currentDateTime = new Date();

  const events = await Event.find(
    { to: { $gte: currentDateTime } },
    {
      ageLimit: 0,
      ownerId: 0,
      insiders: 0,
      createdAt: 0,
      updatedAt: 0,
    },
    {
      lean: true,
      sort: { visitor: -1 },
    }
  );
  if (!events.length)
    throwError({ status: STATUS_CODES.NOT_FOUND, message: "No Event found" });

  const { ongoingEvents, upcomingEvents } = events.reduce(
    (acc, event) => {
      const isActive =
        event.from <= currentDateTime && currentDateTime <= event.to;
      if (isActive) {
        acc.ongoingEvents.push(event);
      } else {
        acc.upcomingEvents.push(event);
      }
      return acc;
    },
    {
      ongoingEvents: [],
      upcomingEvents: [],
    }
  );
  return { ongoingEvents, upcomingEvents };
};

module.exports.addFavouriteEvents = async (req) => {
  const userId = req.id;
  const { eventId } = req.body;

  const eventExists = await Event.findById(eventId);
  if (!eventExists) {
    throwError({
      status: STATUS_CODES.NOT_FOUND,
      message: "No such event found",
    });
  }

  await UserFavourites.updateOne(
    { userId },
    { $addToSet: { favouritesEvents: eventId } },
    { upsert: true }
  );
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
  const { eventId } = req.body;

  const eventExists = await Event.findById(eventId);
  if (!eventExists) {
    throwError({
      status: STATUS_CODES.NOT_FOUND,
      message: "No such event found",
    });
  }

  await UserFavourites.updateOne(
    { userId },
    { $pull: { favouritesEvents: eventId } }
  );
};

module.exports.visitorCount = async (req) => {
  const { eventId } = req.body;
  const eventExists = await Event.findById(eventId);
  if (!eventExists) {
    throwError({
      status: STATUS_CODES.NOT_FOUND,
      message: "No such event found",
    });
  }
  await Event.findOneAndUpdate({ _id: eventId }, { $inc: { visitor: 1 } });
  return;
};
