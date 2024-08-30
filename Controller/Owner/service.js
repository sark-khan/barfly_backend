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
const { uploadBufferToS3, generatePresignedUrl } = require("../aws-service");
const { shiftArrayRight } = require("../../Utils/commonFunction");
const Order = require("../../Models/Order");

module.exports.createCounter = async (req) => {
  const { counterName, isTableService, isSelfPickUp, totalTables } = req.body;
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

  const newCounter = await Counter.findOneAndUpdate(
    { counterName, ownerId: req.id, entityId: req.entityId },
    {
      counterName,
      ownerId: req.id,
      entityId: req.entityId,
      isTableService,
      isSelfPickUp,
      totalTables,
    },
    { new: true, upsert: true, lean: true }
  );

  if (!newCounter) {
    throw {
      status: STATUS_CODES.INTERNAL_SERVER_ERROR,
      message: "Failed to create or update insider",
    };
  }
  // await this.updateCounterSettings({
  //   body: {
  //     isTableService,
  //     isSelfPickUp,
  //     counterId: newCounter._id,
  //     totalTables,
  //   },
  // });
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
    file,
    currency,
    menuCategoryId,
    availableQuantity,
  } = req.body;

  console.log({ itemName });

  // if (
  //   !itemName ||
  //   !price ||
  //   !quantity ||
  //   !description ||
  //   !type ||
  //   !file ||
  //   !menuCategoryId ||
  //   !availableQuantity
  // ) {
  //   throw { status: 400, message: "All fields are required" };
  // }

  const fileBuffer = req.file.buffer;
  console.log({ ss: req.file });
  const fileName = req.file.originalname;
  const data = await uploadBufferToS3(fileBuffer, fileName);
  if (!data.Location) {
    throwError({
      message: "Error occured while uplaoding the file",
      status: STATUS_CODES.SERVER_ERROR,
    });
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
    quantity,
    description,
    type,
    image: fileName.replace(" ", "_"),
  });
  const counterId = await MenuCategory.findById(menuCategoryId, {
    counterId: 1,
  });

  const itemDetails = await ItemDetails.create({
    price,
    availableQuantity,
    currency,
    menuCategoryId,
    entityId: req.entityId,
    counterId: counterId.id,
    itemId: newItem._id,
  });

  return itemDetails;
};

module.exports.updateMenuItem = async (req) => {
  const {
    itemId,
    itemName,
    price,
    quantity,
    description,
    type,
    image,
    currency,
    availableQuantity,
  } = req.body;

  const itemDetails = await ItemDetails.findOneAndUpdate(
    { _id: itemId }, // Filter
    { $set: { availableQuantity, currency, price } }, // Update
    { new: true } // Options: return the updated document
  );
  console.log({ itemDetails });

  await MenuItem.updateOne(
    { _id: itemDetails.itemId },
    { $set: { itemName, quantity, description, type, image } }
  );
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

module.exports.getParticularItemDetail = async (req) => {
  const { menuItemId } = req.query;
  const itemDetails = await ItemDetails.findById(menuItemId).populate({
    path: "itemId",
  });
  if (itemDetails) {
    itemDetails.itemId.image = generatePresignedUrl(itemDetails.itemId.image);
  }
  // const itemDetails=
  return itemDetails;
};

module.exports.createEvent = async (req) => {
  const {
    eventName,
    startingDate,
    endDate,
    isRepetitive,
    repetitiveDays,
    from,
    to,
    counterIds,
    ageLimit,
  } = req.body;

  const ownerId = req.id;
  console.log({ from, to, startingDate });
  const dateTimeFrom = new Date(from);
  const dateTimeTo = new Date(to);
  console.log({ dateTimeFrom, dateTimeTo });
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
  let repetitiveDaysArr = [];
  if (!isRepetitive) {
    repetitiveDaysArr = [];
  } else {
    repetitiveDaysArr = shiftArrayRight(repetitiveDays);
  }

  const newEvent = new Event({
    eventName,
    isRepetitive,
    repetitiveDays: repetitiveDaysArr,
    startingDate: new Date(startingDate),
    endDate: new Date(endDate),
    from: dateTimeFrom,
    to: dateTimeTo,
    ageLimit,
    ownerId,
    counterIds,
    entityId: req.entityId,
    activeUsers: 0,
  });

  const savedEvent = await newEvent.save();
  return savedEvent;
};

module.exports.getUpcomingEvents = async (req) => {
  const currentDateTime = new Date();
  const ownerId = req.id;

  const upcomingEvents = await Event.find({
    ownerId,
    entityId: req.entityId,
    from: { $gte: currentDateTime },
  }).sort({ date: 1 });
  return upcomingEvents;
};

module.exports.getDistinctYears = async (req) => {
  const ownerId = req.id;
  const distinctYears = await Event.aggregate([
    {
      $match: {
        ownerId: mongoose.Types.ObjectId(ownerId),
        entityId: mongoose.Types.ObjectId(req.entityId),
        to: { $lt: new Date() },
      },
    },
    {
      $group: {
        _id: null, // Group all documents together
        years: { $addToSet: { $year: "$startingDate" } }, // Collect distinct years in an array
      },
    },
    {
      $unwind: "$years", // Flatten the array of years
    },
    {
      $sort: {
        years: -1, // Sort by year in descending order
      },
    },
    {
      $project: {
        _id: 0, // Exclude the _id field
        year: "$years", // Project the year field
      },
    },
  ]);

  // {"message":"Past event months and years successfully fetched","pastEventsMonthsYear":[{"_id":{"year":2024}}]}

  return distinctYears;
};

module.exports.getOngoingEventDetails = async (req) => {
  const currentTime = new Date();
  const events = await Event.find(
    {
      from: { $lte: currentTime },
      to: { $gte: currentTime },
      entityId: req.entityId,
    },
    null,
    { sort: { from: -1 }, lean: 1 }
  );
  const eventIds = new Map();
  const ongoingEvents = events?.filter((event) => {
    if (event.isRepetitive == true) {
      const day = currentTime.getDay();
      if (event.repetitiveDays[day] == false) {
        return false;
      }
    }
    eventIds.set(event._id, {
      isRepetitive: event.isRepetitive,
      from: event.from,
      to: event.to,
    });

    
    return true;

  });
  console.log({ eventIds });
  const ordersOfEvents = await Order.find({
    eventId: { $in: Array.from(eventIds.keys()) },
  });
  console.log({ ordersOfEvents });
  const ordersMap = new Map();
  const ongoingEventDetailsWithOrders = ordersOfEvents?.reduce(
    (acc, orders) => {
      // acc[orders.eventId] = {
      //   totalOrders:
      // };
    
    }
  );

  return ongoingEvents;
};

module.exports.getDistinctMonthsOfYear = async (req) => {
  const ownerId = req.id;
  const { year } = req.query;
  const date = new Date();
  date.setFullYear(year, 0, 1); // Sets year, month (0 for January), and day
  date.setHours(0, 0, 0, 0);
  const distinctMonthsAndYears = await Event.aggregate([
    {
      $match: {
        ownerId: mongoose.Types.ObjectId(ownerId),
        entityId: mongoose.Types.ObjectId(req.entityId),
        startingDate: { $gte: date },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: "$startingDate" }, // Group by year of 'startingDate'
          month: { $month: "$startingDate" },
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

  console.log({ distinctMonthsAndYears: distinctMonthsAndYears[0]._id });

  return distinctMonthsAndYears.map((doc) => ({
    year: doc._id.year,
    month: doc._id.month,
  }));
};

module.exports.getMonthlyEventDetails = async (req) => {
  const { month, year } = req.query;
  const startingOfMonth = new Date();
  startingOfMonth.setMonth(month - 1);
  startingOfMonth.setFullYear(year);
  startingOfMonth.setDate(1);
  startingOfMonth.setHours(0, 0, 0, 0);

  const endOfMonth = new Date();
  endOfMonth.setMonth(month);
  endOfMonth.setFullYear(year);
  endOfMonth.setDate(1);
  endOfMonth.setHours(0, 0, 0, 0);
  console.log({ startingOfMonth, endOfMonth });
  const eventsForThatMonth = await Event.find({
    $or: [
      {
        from: { $lte: endOfMonth },
        to: { $gte: startingOfMonth },
      },
    ],
    entityId: req.entityId,
  });
  const eventIds = eventsForThatMonth.map((event) => event._id);
  const ordersOfThatEvent = await Order.find({
    eventId: { $in: eventIds },
  });
  const eventDetailsMap = eventsForThatMonth.reduce((acc, event) => {
    acc[event._id] = {
      id: event._id, // Include the ID in each entry for conversion to an array
      name: event.eventName,
      eventDate: event.startingDate,
      totalOrders: 0,
      totalAmount: 0,
      orders: [],
    };
    return acc;
  }, {});

  // Group orders by event ID and calculate totals
  ordersOfThatEvent.forEach((order) => {
    if (eventDetailsMap[order.eventId]) {
      eventDetailsMap[order.eventId].orders.push(order);
      eventDetailsMap[order.eventId].totalOrders += 1;
      eventDetailsMap[order.eventId].totalAmount += order.totalAmount || 0;
    }
  });

  const monthlyEventDetails = Object.values(eventDetailsMap);

  // Convert the map to an array
  return monthlyEventDetails;
};

module.exports.getEventsByMonthAndYear = async (month, year) => {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1);

  const events = await Event.find({
    startingDate: {
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
    console.log({ menuItem });
    delete menuItem.itemId;
    itemDetails.image = generatePresignedUrl(itemDetails.image);
    acc.push({
      ...itemDetails,
      ...menuItem,
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
