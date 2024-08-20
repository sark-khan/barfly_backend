const Bar = require("../../Models/Bar");
const Insider = require("../../Models/Counter");
const Event = require("../../Models/Event");
const InsiderElement = require("../../Models/MenuCategory");
const MenuItem = require("../../Models/MenuItem");
const { STATUS_CODES, INSIDER_TYPE } = require("../../Utils/globalConstants");
const throwError = require("../../Utils/throwError");
const mongoose = require("mongoose");
const { appClient } = require("../../redis");
const EntityDetails = require("../../Models/EntityDetails");
const Counter = require("../../Models/Counter");
const Menu = require("../../Models/MenuCategory");
const MenuCategory = require("../../Models/MenuCategory");
const ItemDetails = require("../../Models/ItemDetails");

module.exports.createCounter = async (req) => {
  const { counterName } = req.body;
  if (!counterName) {
    throw {
      status: STATUS_CODES.BAD_REQUEST,
      message: "Couter name is required",
    };
  }

  const existingCounter = await Counter.findOne(
    { counterName, ownerId: req.id },
    { _id: 1 }
  );

  if (existingCounter) {
    throw {
      status: STATUS_CODES.CONFLICT,
      message: "This counter name already exists",
    };
  }
  console.log({ ss: req.entityId });

  const newCounter = await Counter.findOneAndUpdate(
    { counterName, ownerId: req.id, entityId: req.entityId },
    { counterName, ownerId: req.id, entityId: req.entityId },
    { new: true, upsert: true, lean: true }
  );

  if (!newCounter) {
    throw {
      status: STATUS_CODES.INTERNAL_SERVER_ERROR,
      message: "Failed to create or update insider",
    };
  }

  const response = newCounter;
  delete response.createdAt;
  delete response.updatedAt;
  delete response.ownerId;

  return response;
};

module.exports.createCounterMenuCategory = async (req) => {
  const { counterId, name, icon } = req.body;

  if (!counterId || !name || !icon) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "CounterId, Name, and Icon are required",
    });
  }

  const newElement = await MenuCategory.create({
    counterId,
    name,
    icon,
    entityId: req.entityId,
  });
  return newElement;
};

module.exports.getInsiderElements = async (insiderId) => {
  try {
    if (!insiderId) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "InsiderId is required",
      });
    }
    const elements = await InsiderElement.find({ insiderId }).lean();
    return elements;
  } catch (error) {
    throw {
      status: error.status || STATUS_CODES.INTERNAL_SERVER_ERROR,
      message: error.message || "Failed to fetch insider elements",
    };
  }
};

module.exports.createMenuItem = async (req) => {
  const {
    itemName,
    price,
    quantity,
    description,
    type,
    image,
    currency,
    menuCategoryId,
    availableQuantity,
    counterId,
  } = req.body;

  if (
    !itemName ||
    !price ||
    !quantity ||
    !description ||
    !type ||
    !image ||
    !menuCategoryId
  ) {
    throw { status: 400, message: "All fields are required" };
  }

  const menuCategory = await MenuCategory.findById(menuCategoryId);
  if (!menuCategory) {
    throw {
      status: STATUS_CODES.NOT_FOUND,
      message: "Menu Category not found",
    };
  }
  const existingItem = await MenuItem.findOne(
    { itemName, menuCategoryId },
    { _id: 1 }
  );
  if (existingItem) {
    throwError({
      message: "Same item exists in this menu",
      status: STATUS_CODES.CONFLICT,
    });
  }

  const newItem = await MenuItem.create({
    itemName,
    // price,
    quantity,
    description,
    type,
    // availableQuantity,
    // currency,
    image,
    // menuCategoryId: menuCategoryId,
  });

  const itemDetails = await ItemDetails.create({
    price,
    availableQuantity,
    currency,
    menuCategoryId,
    entityId: req.entityId,
    counterId: counterId,
    itemId: newItem._id,
  });

  return itemDetails;
};

module.exports.getCreatedItems = async (req) => {
  try {
    const { insiderElementId } = req.query;
    if (!insiderElementId) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "InsiderElementId is required",
      });
    }

    const createdItems = await MenuItem.find({ insiderElementId }).lean();
    return createdItems;
  } catch (error) {
    throw {
      status: error.status || STATUS_CODES.INTERNAL_SERVER_ERROR,
      message: error.message || "Failed to fetch created items",
    };
  }
};

module.exports.createEvent = async (req) => {
  const {
    locationName,
    eventName,
    startingDate,
    endDate,
    isRepitative,
    repetitiveDays,
    from,
    to,
    counterIds,
    ageLimit,
  } = req.body;

  const ownerId = req.id;
  const dateTimeFrom = new Date(from);
  const dateTimeTo = new Date(to);

  if (isNaN(dateTimeFrom.getTime()) || isNaN(dateTimeTo.getTime())) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "The time format is invalid",
    });
  }

  if (dateTimeFrom > dateTimeTo) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Invalid time selection",
    });
  }

  const existingEvent = await Event.findOne({
    locationName,
    eventName,
    ownerId,
    entityId: req.entityId,
  });

  if (existingEvent) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: "An event with the same details already exists",
    });
  }

  if (!isRepitative) {
    repetitiveDays = [];
  }

  const newEvent = new Event({
    locationName,
    eventName,
    isRepitative,
    repetitiveDays,
    startingDate: new Date(startingDate),
    endDate: new Date(endDate),
    from: dateTimeFrom,
    to: dateTimeTo,
    ageLimit,
    ownerId,
    counterIds,
  });

  const savedEvent = await newEvent.save();
  return savedEvent;
};

module.exports.getUpcomingEvents = async (req) => {
  const currentDateTime = new Date();
  const ownerId = req.id;

  const upcomingEvents = await Event.find({
    ownerId,
    date: { $gte: currentDateTime },
  }).sort({ date: 1 });
  return upcomingEvents;
};

module.exports.getDistinctMonthsAndYears = async (req) => {
  const ownerId = req.id;
  const distinctMonthsAndYears = await Event.aggregate([
    {
      $match: {
        ownerId: mongoose.Types.ObjectId(ownerId),
        date: { $lt: new Date() },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: "$date" },
          month: { $month: "$date" },
        },
      },
    },
    {
      $sort: {
        "_id.year": -1,
        "_id.month": -1,
      },
    },
  ]);

  return distinctMonthsAndYears.map((doc) => ({
    year: doc._id.year,
    month: doc._id.month,
  }));
};

module.exports.getEventsByMonthAndYear = async (month, year) => {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1);

  const events = await Event.find({
    date: {
      $gte: startDate,
      $lt: endDate,
    },
  }).sort({ date: 1 });

  return events;
};

module.exports.getMenuCategory = async (req) => {
  const { counterId } = req.query;
  const menuCategories = await MenuCategory.find(
    { counterId, entityId: req.entityId },
    { entityId: 0, createdAt: 0, updatedAt: 0 },
    { sort: { _id: -1 }, lean: true }
  );

  return menuCategories;
};

module.exports.getMenuCategoryItems = async (req) => {
  const { menuCategoryId } = req.query;
  const menuItems = await ItemDetails.find(
    { menuCategoryId, entityId: req.entityId },
    { menuCategoryId: 0 },
    {
      sort: { updatedAt: -1 },
      lean: true,
    }
  ).populate("itemId");

  const menuItemsResp = menuItems.reduce((acc, menuItem) => {
    const itemDetails = menuItem.itemId;
    delete menuItem.itemId;
    acc.push({
      ...menuItem,
      ...itemDetails,
    });
    return acc;
  }, []);
  // const itemDetails= menuItems.itemId;
  // delete menuItems

  return menuItemsResp;
};

module.exports.getCounterMenuQuantites = async (req) => {
  const { itemId } = req.query;
  const itemDetails = await ItemDetails.find(
    { entityId: req.entityId, itemId },
    { counterId: 1, availableQuantity: 1 },
    { lean: 1 }
  );
  console.log({ itemDetails });
  if (!itemDetails.length) {
    throwError({
      message: "This item does not belong to this entity",
      status: 404,
    });
  }
  const counterListOfEntity = await Counter.find(
    { entityId: req.entityId },
    { counterName: 1, _id: 1 },
    { sort: { _id: -1 }, lean: 1 }
  );
  const counterListQuantity = counterListOfEntity.reduce(
    (acc, counterDetails) => {
      const id = counterDetails._id.toString();
      const length = acc.length;
      itemDetails.forEach((itemDetail) => {
        if (itemDetail.counterId.toString() === id) {
          acc.push({
            counterName: counterDetails.counterName,
            availableQuantity: itemDetail.availableQuantity,
            _id: counterDetails._id,
          });
          return;
        }
      });
      if (length == acc.length) {
        acc.push({
          counterName: counterDetails.counterName,
          availableQuantity: 0,
          _id: counterDetails._id,
        });
      }
      return acc;
    },
    []
  );
  return counterListQuantity;
};

module.exports.updateCounterSettings = async (req) => {
  const { isTableService, isSelfPickUp, counterId, totalTables } = req.body;

  const counter = await Counter.updateOne(
    { _id: counterId },
    { $set: { isTableService, isSelfPickUp, totalTables } }
  );
  if (counter.matchedCount == 0) {
    throwError({ message: "No Such counter exists", status: 404 });
  }
  return counter;
};

module.exports.getCounterSettings = async (req) => {
  const { counterId } = req.query;
  const counterSettings = await Counter.findOne(
    { _id: counterId },
    { counterName: 1, isTableService: 1, isSelfPickUp: 1, totalTables: 1 },
    { lean: 1 }
  );
  return counterSettings;
};
