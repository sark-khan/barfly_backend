const Event = require("../../Models/Event");
// const UserFavourites = require("../../Models/UserFavourites");
const { STATUS_CODES, REDIS_KEYS } = require("../../Utils/globalConstants");
const throwError = require("../../Utils/throwError");
const { appClient } = require("../../redis");
const EntityDetails = require("../../Models/EntityDetails");
const mongoose = require("mongoose");
const Counter = require("../../Models/Counter");
const MenuCategory = require("../../Models/MenuCategory");
const MenuItem = require("../../Models/MenuItem");

module.exports.getEntities = async (req) => {
  const now = new Date();

  const currentRunningEvents = await Event.find(
    {
      $and: [
        { from: { $lte: now } },
        { to: { $gte: now } },
        { entityId: { $exists: true } },
      ],
    },
    { entityId: 1 }
  );

  const entityIds = currentRunningEvents.map((entity) => entity.entityId);

  const currentRunningEntitiesDetails = await EntityDetails.find(
    {
      _id: { $in: entityIds },
    },
    { city: 1, entityName: 1, entityType: 1 }
  ).lean();

  const entityNamesSet = new Set(
    currentRunningEntitiesDetails.map((entity) => entity.entityName)
  );

  const remainingEntities = await EntityDetails.find(
    { _id: { $nin: entityIds } },
    { city: 1, entityName: 1, entityType: 1, street: 1 }
  ).lean();

  const uniqueRemainingEntities = remainingEntities.filter(
    (entity) => !entityNamesSet.has(entity.entityName)
  );

  return {
    ongoingEventEntities: currentRunningEntitiesDetails,
    remainingEntities: uniqueRemainingEntities,
  };
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

module.exports.counterList = async (req) => {
  const { entityId } = req.query;
  const counters = await Counter.find(
    { entityId },
    { counterName: 1 },
    { sort: { _id: -1 }, lean: true }
  );
  const counterIds = counters.map((counter) => counter._id);
  const eventOfThisCounters = await Event.find(
    { counterId: { $in: counterIds } },
    {
      from: 1,
      to: 1,
      startingDate: 1,
      endDate: 1,
      isRepetitive: 1,
      repetitiveDays: 1,
    },
    { lean: 1 }
  );

  const now = new Date();
  const day = now.getDay();

  const counterList = counters.map((counter) => {
    const relatedEvents = eventOfThisCounters.filter((event) =>
      event.counterId.equals(counter._id)
    );

    if (relatedEvents.length > 0) {
      const isLive = relatedEvents.some((event) => {
        if (event.isRepetitive) {
          return (
            event.repetitiveDays.includes(day) &&
            event.from < now &&
            event.to > now
          );
        } else {
          return event.from < now && event.to > now;
        }
      });
      return {
        ...counter,
        isLive: isLive,
      };
    } else {
      return {
        ...counter,
        isLive: false,
      };
    }
  });

  console.log({ counterList });
  return counterList;
};

module.exports.getMenuSubCategory = async (req) => {
  const { counterId } = req.query;
  const counterSubCategory = await MenuCategory.find({ counterId });
  return counterSubCategory;
};

module.exports.getMenuItems = async (req) => {
  const { menuId } = req.query;
  const menuItems = await MenuItem.find({ menuId });
  return menuItems;
};
