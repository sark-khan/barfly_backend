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
const FavouriteEntity = require("../../Models/FavouriteEntity");

module.exports.getEntities = async (req) => {
  const now = new Date();

  const favouritesList = await FavouriteEntity.find(
    { userId: req.id, isFavourite: true },
    { _id: 1, entityId: 1 },
    { lean: true }
  );

  console.log({ favouritesList });
  const favouritesIdsSet = new Set();
  favouritesList.forEach((id) => {
    favouritesIdsSet.add(id.entityId.toString());
  });
  console.log({ favouritesIdsSet });

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
  const query = {
    _id: { $in: entityIds },
  };

  if (req.query?.searchTerm && req.query.seacrhTerm != "") {
    query.entityName = { $regex: req.query.searchTerm, $options: "i" }; // Case-insensitive search
  }

  const currentRunningEntitiesDetails1 = await EntityDetails.find(query, {
    city: 1,
    entityName: 1,
    entityType: 1,
  }).lean();
  const query2 = {
    _id: { $nin: entityIds },
  };

  const currentRunningEntitiesDetails = currentRunningEntitiesDetails1.map(
    (entity) => {
      if (favouritesIdsSet.has(entity._id)) {
        entity.isFavouriteEntity = true;
      } else {
        entity.isFavouriteEntity = false;
      }
      return entity;
    }
  );

  if (req.query?.searchTerm && req.query.seacrhTerm != "") {
    console.log("eched hrere");
    query2.entityName = { $regex: req.query.searchTerm, $options: "i" }; // Case-insensitive search
  }
  const entityNamesSet = new Set(
    currentRunningEntitiesDetails.map((entity) => entity.entityName)
  );

  const remainingEntities = await EntityDetails.find(query2, {
    city: 1,
    entityName: 1,
    entityType: 1,
    street: 1,
  }).lean();

  const uniqueRemainingEntities1 = remainingEntities.filter(
    (entity) => !entityNamesSet.has(entity.entityName)
  );

  console.log({ uniqueRemainingEntities1 });

  const uniqueRemainingEntities = uniqueRemainingEntities1.map((entity) => {
    console.log({ entity: entity._id });
    if (favouritesIdsSet.has(entity._id.toString())) {
      console.log({ dd: "dsjdkskdsdksd" });
      entity.isFavouriteEntity = true;
    } else {
      entity.isFavouriteEntity = false;
    }
    console.log({ entity });
    return entity;
  });

  let currentRunningEntitiesDetailsResponse = [];
  let uniqueRemainingEntitiesResponse = [];
  console.log("qwerrtt",{re: req.query})
  if (req.query.isFavouriteEntities == "true") {
    console.log("sssdsdsdsadsadsadsadsadsa?>???????????");
    currentRunningEntitiesDetailsResponse =
      currentRunningEntitiesDetails.filter((entity) => {
        return entity.isFavouriteEntity;
      });
    uniqueRemainingEntitiesResponse = uniqueRemainingEntities.filter(
      (entity) => {
        return entity.isFavouriteEntity;
      }
    );
  }
  console.log({
    currentRunningEntitiesDetailsResponse,
    uniqueRemainingEntitiesResponse,
  });
  // const currentRunningEntitiesDetailsResponse= currentRunningEntitiesDetails.map((entity)=>{

  // })

  return {
    ongoingEventEntities: req.query.isFavouriteEntities=="true"
      ? currentRunningEntitiesDetailsResponse
      : currentRunningEntitiesDetails,
    remainingEntities: req.query.isFavouriteEntities== "true"
      ? uniqueRemainingEntitiesResponse
      : uniqueRemainingEntities,
  };
};

module.exports.addFavouriteEntity = async (req) => {
  const userId = req.id;
  const { entityId, isFavourite } = req.body;

  await FavouriteEntity.updateOne(
    { userId, entityId },
    {
      isFavourite,
    },
    { upsert: true }
  );
  return;
};

module.exports.getFavouriteEvents = async (req) => {
  const userId = req.id;
  const userFavourites = await FavouriteEntity.findOne({ userId }).populate(
    "entityId"
  );

  // if (!userFavourites) {
  //   throwError({
  //     status: STATUS_CODES.NOT_FOUND,
  //     message: "No favourite events found for the user",
  //   });
  // }

  return userFavourites;
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
  const { menuCategoryId } = req.query;
  const menuItems = await MenuItem.find({ menuCategoryId });
  return menuItems;
};
