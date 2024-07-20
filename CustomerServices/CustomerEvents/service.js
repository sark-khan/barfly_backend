const Event = require("../../Models/Event");
const Product = require("../../Models/EntityDetails");
// const UserFavourites = require("../../Models/UserFavourites");
const { STATUS_CODES, REDIS_KEYS } = require("../../Utils/globalConstants");
const throwError = require("../../Utils/throwError");
const { appClient } = require("../../redis");
const EntityDetails = require("../../Models/EntityDetails");
const  mongoose  = require("mongoose");

module.exports.getEntities = async (req) => {
  // const currentDateTime = new Date();
  const todayEventsEntities = JSON.parse(
    await appClient.get(REDIS_KEYS.LIVE_ENTITY)
  );

  // const en,tityIds = ongoingEventsEntities.map((ongoingEventsEntity) => {
  //   return ongoingEventsEntity._id;
  // });
  const now = new Date();
  const { ongoingEventsEntites, enitityIds, upcomingEventsEntities } = todayEventsEntities.reduce(
    (acc, entity) => {
      console.log({ii:entity._id});
      acc.enitityIds.push(mongoose.Types.ObjectId(entity._id));
      const event = entity.event;
      console.log({event});
      const now = new Date();
      if (new Date(event.from) < now && new Date(event.to)> now) {
        console.log("reacgd grerere");
        acc.ongoingEventsEntites.add(entity);
      } else {
        acc.upcomingEventsEntities.add(entity);
      }
      return acc;
    },
    {
      ongoingEventsEntites: new Set(),
      enitityIds: [],
      upcomingEventsEntities: new Set(),
    }
  );
  // console.log({ongoingEventsEntites, enitityIds, upcomingEventsEntities});
  const remainingEntities = await EntityDetails.find(
    { _id: { $nin:  enitityIds  } },
    { city: 1, entityName: 1, entityType: 1 },
    { lean: true }
  );

  return { ongoingEventsEntites:Array.from(ongoingEventsEntites), upcomingEventsEntities:Array.from(upcomingEventsEntities), remainingEntities };
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
