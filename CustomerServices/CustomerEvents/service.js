const Event = require("../../Models/Event");
const Product = require("../../Models/EntityDetails");
// const UserFavourites = require("../../Models/UserFavourites");
const { STATUS_CODES, REDIS_KEYS } = require("../../Utils/globalConstants");
const throwError = require("../../Utils/throwError");
const { appClient } = require("../../redis");
const EntityDetails = require("../../Models/EntityDetails");
const mongoose = require("mongoose");
const mongoose = require("mongoose");
const FavouriteEntities = require("../../Models/FavouriteEntities");

module.exports.getEntities = async (req) => {
  const { searchText } = req.query;
  console.log({ searchText });
  const todayEventsEntities = JSON.parse(
    await appClient.get(REDIS_KEYS.LIVE_ENTITY)
  );
  const now = new Date();
  const regex = new RegExp(searchText,'i');
  const { ongoingEventsEntites, enitityIds, upcomingEventsEntities } =
    todayEventsEntities.reduce(
      (acc, entity) => {
        if (searchText) {
          const found = regex.test(entity.entityDetails.entityName);
          console.log({ found });
          if (!found) return acc;
        }
        acc.enitityIds.push(mongoose.Types.ObjectId(entity._id));
        const event = entity.event;
        if (new Date(event.from) < now && new Date(event.to) > now) {
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
  const query = { _id: { $nin: enitityIds } };
  if (searchText) {
    query.entityName = { $regex: searchText, $options: "i" };
  }
  const remainingEntities = await EntityDetails.find(
    query,
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
  const { entityId } = req.body;
  console.log({ entityId });
  let favouritesEntities = JSON.parse(
    await appClient.get(`${REDIS_KEYS.FAVOURITE_ENTITIES}:${userId}`)
  );
  console.log({ favouritesEntities });
  if (favouritesEntities) {
    favouritesEntities.push(entityId);
  } else {
    favouritesEntities = [entityId];
  }

  await appClient.set(
    `${REDIS_KEYS.FAVOURITE_ENTITIES}:${userId}`,
    JSON.stringify(favouritesEntities)
  );

  // const findEntity = todayEventsEntities.map((entity) =>
  //     entity.entityDetails._id === entityId
  // );
  // console.log("findEntity", findEntity);

  // if (findEntity ) {
  //   throwError({
  //     status: STATUS_CODES.NOT_FOUND,
  //     message: `No such entity found`,
  //   });
  // }
  FavouriteEntities.updateOne(
    { userId },
    { $addToSet: { favouritesEvents: entityId } },
    { upsert: true }
  );
};

module.exports.getFavouriteEntity = async (req) => {
  const userId = req.id;
  const { searchText } = req.query;
  const favouriteEntitiesIds = JSON.parse(
    await appClient.get(`${REDIS_KEYS.FAVOURITE_ENTITIES}:${userId}`)
  );
  const query = { _id: { $in: favouriteEntitiesIds } };
  if (searchText) {
    query.entityName = { $regex: searchText, $options: "i" };
  }
  console.log(query);
  const favouriteEntityDetails = await EntityDetails.find(query, {
    city: 1,
    street: 1,
    entityName: 1,
    entityType: 1,
  });

  console.log("************", favouriteEntityDetails);
  if (!favouriteEntityDetails) {
    throwError({
      status: STATUS_CODES.NOT_FOUND,
      message: "No favourite events found for the user",
    });
  }

  return favouriteEntityDetails;
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
  // const eventExists = await EntityDetails.findById(eventId);
  // if (!eventExists) {
  //   throwError({
  //     status: STATUS_CODES.NOT_FOUND,
  //     message: "No such event found",
  //   });
  // }
  await EntityDetails.findOneAndUpdate(
    { _id: eventId },
    { $inc: { visitor: 1 } }
  );
  return;
};
