const Event = require("../../Models/Event");
// const UserFavourites = require("../../Models/UserFavourites");
const { STATUS_CODES, REDIS_KEYS } = require("../../Utils/globalConstants");
const throwError = require("../../Utils/throwError");
const { appClient } = require("../../redis");
const EntityDetails = require("../../Models/EntityDetails");
const mongoose = require("mongoose");
const Counter = require("../../Models/Counter");

module.exports.getEntities = async (req) => {
  // const currentDateTime = new Date();
  // let todayEventsEntities = JSON.parse(
  //   await appClient.get(REDIS_KEYS.LIVE_ENTITY)
  // );

  // if (!todayEventsEntities) {
  //   todayEventsEntities = [];
  // }

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
  const entityIds = currentRunningEvents.map((entityId) => entityId.entityId);
  const currentRunningEntitiesDetails = await EntityDetails.find(
    {
      _id: { $in: entityIds },
    },
    { city: 1, entityName: 1, entityType: 1 },
    { lean: true }
  );
  // const { ongoingEventsEntites, enitityIds, upcomingEventsEntities } =
  //   todayEventsEntities.reduce(
  //     (acc, entity) => {
  //       acc.enitityIds.push(mongoose.Types.ObjectId(entity._id));
  //       const event = entity.event;
  //       if (new Date(event.from) < now && new Date(event.to) > now) {
  //         console.log("reacgd grerere");
  //         acc.ongoingEventsEntites.add(entity.entityDetails);
  //       } else if (!acc.ongoingEventsEntites.has(entity.entityDetails)) {
  //         console.log({
  //           hh: acc.ongoingEventsEntites,
  //         });
  //         acc.upcomingEventsEntities.add(entity.entityDetails);
  //       }
  //       return acc;
  //     },
  //     {
  //       ongoingEventsEntites: new Set(),
  //       enitityIds: [],
  //       upcomingEventsEntities: new Set(),
  //     }
  //   );

  const remainingEntities = await EntityDetails.find(
    { _id: { $nin: entityIds } },
    { city: 1, entityName: 1, entityType: 1 },
    { lean: true }
  );

  return {
    ongoingEventEntities: currentRunningEntitiesDetails,
    remainingEntities,
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
    { lean: true }
  );
  const counterIds = counters.map((counter) => counter._id);
  const eventOfThisCounters = await Event.find(
    { counterIds: { $in: counterIds } },
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
  const now= new Date();
  const ongoingEventCounters= eventOfThisCounters.reduce((acc, eventCounter)=>{
    // if(eventCounter.starting)
  },[])
};
