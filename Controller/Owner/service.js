const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const Event = require("../../Models/Event");
const InsiderElement = require("../../Models/MenuCategory");
const MenuItem = require("../../Models/MenuItem");
const {
  STATUS_CODES,
  INSIDER_TYPE,
  EDIT_ACTION,
  STATUS,
} = require("../../Utils/globalConstants");
const throwError = require("../../Utils/throwError");

const Counter = require("../../Models/Counter");
const MenuCategory = require("../../Models/MenuCategory");
const ItemDetails = require("../../Models/ItemDetails");
const { uploadBufferToS3, generatePresignedUrl } = require("../aws-service");
const {
  shiftArrayRight,
  comparePassword,
} = require("../../Utils/commonFunction");
const Order = require("../../Models/Order");
const Discount = require("../../Models/Discount");
const EntityDetails = require("../../Models/EntityDetails");
const User = require("../../Models/User");
const Tables = require("../../Models/Tables");
const Feedbacks = require("../../Models/UserFeedback");
const FeedbackQuestions = require("../../Models/FeedbackQuestions");
const globalConstants = require("../../Utils/globalConstants");

const ALL_ANSWER_TYPES = globalConstants.ALL_ANSWER_TYPES;

module.exports.createCounter = async (req) => {
  const { counterName, isTableService, isSelfPickUp, totalTables } = req.body;

  if (!counterName) {
    throw {
      status: STATUS_CODES.BAD_REQUEST,
      message: "Counter name is required",
    };
  }

  // Check if a counter with the same name already exists for this owner
  const existingCounter = await Counter.findOne(
    {
      counterName,
      ownerId: req.userId,
      entityId: req.entityId,
      status: STATUS.ACTIVE,
    },
    { _id: 1 }
  );

  if (existingCounter) {
    throw {
      status: STATUS_CODES.BAD_REQUEST,
      message: "This counter name already exists",
    };
  }

  const newCounter = await Counter.create({
    counterName,
    ownerId: req.userId,
    entityId: req.entityId,
    isTableService,
    isSelfPickUp,
    totalTables,
    status: STATUS.ACTIVE,
  });

  return newCounter.toObject(); // Convert to plain object for response
};

module.exports.createCounterMenuCategory = async (req) => {
  const {
    entityId,
    body: { categories },
  } = req;

  if (!Array.isArray(categories) || categories.length === 0) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Categories must be a non-empty array.",
    });
  }

  for (const category of categories) {
    const { categoryName, nutritionType, counterIds } = category;

    if (
      !categoryName ||
      !Array.isArray(counterIds) ||
      counterIds.length === 0
    ) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message:
          "Each category must have a categoryName and a non-empty counterIds array.",
      });
    }

    const existingCategory = await MenuCategory.findOne({
      entityId,
      categoryName,
      counterId: { $in: counterIds },
    });

    if (existingCategory) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: `Category name '${categoryName}' already exists for one of the selected counters.`,
      });
    }
  }

  // Creating category objects for each counterId
  const categoryObjects = categories.flatMap(
    ({ categoryName, nutritionType, counterIds }) =>
      counterIds.map((counterId) => ({
        categoryName,
        nutritionType,
        counterId,
        entityId,
      }))
  );

  const createdCategories = await MenuCategory.insertMany(categoryObjects);

  return createdCategories;
};

module.exports.getCounters = async (req) => {
  const {
    userId,
    entityId,
    query: { isItemRequired = "false" },
  } = req;

  // Fetch only active counters
  const counters = await Counter.find(
    { ownerId: userId, entityId, status: STATUS.ACTIVE },
    { counterName: 1, isSelfPickUp: 1, isTableService: 1, totalTables: 1 }
  )
    .sort({ createdAt: -1 })
    .lean();

  if (isItemRequired !== "true") {
    return counters;
  }

  // Fetch active counters' IDs
  const activeCounterIds = counters.map((counter) => counter._id.toString());

  // Fetch items that have at least one active counter
  const items = await ItemDetails.find(
    { entityId },
    { itemName: 1, isOutOfStock: 1, counterIds: 1 }
  ).lean();

  const itemMapping = {};

  items.forEach((item) => {
    // Check if all counterIds for this item are in activeCounterIds
    const validCounterIds = item.counterIds.filter((id) =>
      activeCounterIds.includes(id.toString())
    );

    if (validCounterIds.length === item.counterIds.length) {
      validCounterIds.forEach((counterId) => {
        if (!itemMapping[counterId]) {
          itemMapping[counterId] = [];
        }
        itemMapping[counterId].push({
          itemName: item.itemName,
          isOutOfStock: item.isOutOfStock,
          _id: item._id,
        });
      });
    }
  });

  // Attach only items belonging to active counters
  const counterDetails = counters.map((counter) => ({
    ...counter,
    items: itemMapping[counter._id] || [],
  }));

  return counterDetails;
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
      status: error.status || STATUS_CODES.BAD_REQUEST,
      message: error.message || "Failed to fetch insider elements",
    };
  }
};

module.exports.createMenuItem = async (req) => {
  const {
    file,
    body: {
      itemName,
      price,
      description,
      currency,
      menuCategoryIds,
      quantity,
      isVegan,
      unit,
      nutritionType,
      counterIds,
    },
  } = req;

  let fileName = "";

  if (file) {
    const fileBuffer = file.buffer;
    fileName = `${req.entityId}_${Date.now()}_${file.originalname.replace(
      / /g,
      "_"
    )}`;

    try {
      const data = await uploadBufferToS3(fileBuffer, fileName);
      if (!data.Location) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: "Error occurred while uploading the file",
        });
      }
    } catch (error) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "File upload failed",
      });
    }
  }

  if (menuCategoryIds.length === 0) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "At least one menu category is required",
    });
  }

  const menuCategories = await MenuCategory.find({
    _id: { $in: menuCategoryIds },
  });

  console.log({ menuCategories, menuCategoryIds });

  // if (menuCategories.length != menuCategoryIds.length) {
  //   throwError({
  //     status: STATUS_CODES.NOT_FOUND,
  //     message: "One or more menu categories not found",
  //   });
  // }

  const existingItem = await ItemDetails.findOne({
    itemName,
    menuCategoryId: { $in: menuCategoryIds },
  });

  if (existingItem) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Same item exists in one of the selected menu categories",
    });
  }

  const createdItems = await Promise.all(
    menuCategories.map(async (category) => {
      return ItemDetails.create({
        itemName,
        price,
        currency: "CHF",
        menuCategoryId: category._id,
        entityId: req.entityId,
        counterId: category.counterId,
        counterIds,
        image: fileName,
        isVegan,
        unit,
        description,
        nutritionType,
        isOutOfStock: false,
        quantity,
      });
    })
  );

  return createdItems;
};

// module.exports.createItems = async (req) => {
//   const { itemName, quantity, description, type, price, currency } = req.body;

//   const existingItem = await ItemDetails.findOne({ itemName }, { _id: 1 });
//   if (existingItem) {
//     return throwError({
//       status: STATUS_CODES.BAD_REQUEST,
//       message: "Same Item Name already exists",
//     });
//   }
//   const fileBuffer = req.file.buffer;
//   const fileName = `${req.entityId}_${new Date()}_${req.file.originalname}`;
//   const data = await uploadBufferToS3(fileBuffer, fileName);
//   if (!data.Location) {
//     throwError({
//       status: STATUS_CODES.BAD_REQUEST,
//       message: "Error occured while uplaoding the file",
//     });
//   }
//   await ItemDetails.create({
//     entityId: req.entityId,
//     itemName,
//     quantity,
//     type,
//     price,
//     currency,
//     description,
//     image: fileName.replace(" ", "_"),
//   });
// };

module.exports.updateMenuItem = async (req) => {
  const {
    file,
    body: {
      itemId,
      itemName,
      price,
      description,
      nutritionType,
      currency,
      quantity,
      action,
      isOutOfStock,
      counterIds,
    },
  } = req;

  const item = await ItemDetails.findOne({ _id: itemId });

  if (!item) {
    return throwError({
      status: STATUS_CODES.NOT_FOUND,
      message: "Item not found.",
    });
  }

  if (action === EDIT_ACTION.EDIT) {
    // Update fields only if they exist (handle falsy values correctly)
    if (itemName !== undefined) item.itemName = itemName;
    if (price !== undefined) item.price = price;
    if (description !== undefined) item.description = description;
    if (nutritionType !== undefined) item.nutritionType = nutritionType;
    if (currency !== undefined) item.currency = currency;
    if (quantity !== undefined) item.quantity = quantity;
    if (counterIds !== undefined) item.counterIds = counterIds;
    if (isOutOfStock !== undefined) item.isOutOfStock = isOutOfStock;

    if (file) {
      const fileBuffer = file.buffer;
      const fileName = `${
        req.entityId
      }_${Date.now()}_${file.originalname.replace(/ /g, "_")}`;

      try {
        const data = await uploadBufferToS3(fileBuffer, fileName);
        if (!data.Location) {
          return throwError({
            status: STATUS_CODES.BAD_REQUEST,
            message: "Error occurred while uploading the file",
          });
        }
        item.image = fileName;
      } catch (error) {
        return throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: "File upload failed",
        });
      }
    }

    await item.save(); // Save the updated item
  } else if (action === EDIT_ACTION.DELETE) {
    await ItemDetails.deleteOne({ _id: itemId });
  }
};

module.exports.getCreatedItems = async (req) => {
  const {
    entityId,
    query: {
      menuCategoryId,
      pageNo = 1,
      pageLimit = 8,
      isOutOfStock,
      searchTerm,
    },
  } = req;

  const query = { entityId };

  if (menuCategoryId) {
    query.menuCategoryId = menuCategoryId;
  }

  if (isOutOfStock) {
    query.isOutOfStock = isOutOfStock;
  }

  if (searchTerm) {
    query.itemName = { $regex: searchTerm, $options: "i" };
  }

  const createdItems = await ItemDetails.find(query)
    .populate({
      path: "menuCategoryId",
      select: "categoryName counterId",
      model: "CounterMenuCategory",
      populate: {
        path: "counterId",
        select: "status counterName",
        model: "Counter",
      },
    })
    .lean();

  const filteredItems = createdItems.filter(
    (item) => item.menuCategoryId?.counterId?.status === STATUS.ACTIVE
  );

  const totalCount = filteredItems.length;

  const paginatedItems = filteredItems.slice(
    (pageNo - 1) * pageLimit,
    pageNo * pageLimit
  );

  const itemsList = paginatedItems.map((item) => ({
    ...item,
    image: item.image ? generatePresignedUrl(item.image) : null,
  }));

  return { itemsList, totalCount };
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
    file,
    ownerId,
    userId,
    body: {
      eventName,
      // startingDate,
      // endDate,
      isRepetitive,
      repetitiveDays,
      from,
      to,
      counterIds,
      ageLimit,
      location,
    },
  } = req;

  console.log({ body: req.body });
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

  if (isRepetitive && repetitiveDays) {
    try {
      repetitiveDaysArr = JSON.parse(repetitiveDays); // Convert string to array
    } catch (error) {
      console.error("Error parsing repetitiveDays:", error);
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "Invalid repetitiveDays format",
      });
    }
  }

  let fileName = "";

  if (file) {
    const fileBuffer = file.buffer;
    fileName = `${req.entityId}_${Date.now()}_${file.originalname.replace(
      / /g,
      "_"
    )}`;

    try {
      const data = await uploadBufferToS3(fileBuffer, fileName);
      if (!data.Location) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: "Error occurred while uploading the file",
        });
      }
    } catch (error) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "File upload failed",
      });
    }
  }

  const newEvent = new Event({
    eventName,
    isRepetitive,
    repetitiveDays: repetitiveDaysArr,
    // startingDate: new Date(startingDate),
    // endDate: new Date(endDate),
    from: dateTimeFrom,
    to: dateTimeTo,
    ageLimit,
    ownerId,
    userId,
    counterIds,
    entityId: req.entityId,
    image: fileName,
    location,
  });

  const savedEvent = await newEvent.save();
  await Event.findOneAndUpdate(
    { _id: newEvent._id },
    { $inc: { activeUsers: 1 } }
  );

  return savedEvent;
};

// module.exports.getUpcomingEvents = async (req) => {
//   const currentDateTime = new Date();
//   const {
//     ownerId,
//     entityId,
//     query: { filterBy },
//   } = req;

//   let startDate = currentDateTime;
//   let endDate = null;

//   if (filterBy === "week") {
//     const dayOfWeek = currentDateTime.getDay();
//     const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
//     startDate = new Date(currentDateTime);
//     startDate.setDate(currentDateTime.getDate() + diffToMonday);
//     startDate.setHours(0, 0, 0, 0);

//     endDate = new Date(startDate);
//     endDate.setDate(startDate.getDate() + 6);
//     endDate.setHours(23, 59, 59, 999);
//   } else if (filterBy === "month") {
//     startDate = new Date(
//       currentDateTime.getFullYear(),
//       currentDateTime.getMonth(),
//       1
//     );
//     endDate = new Date(
//       currentDateTime.getFullYear(),
//       currentDateTime.getMonth() + 1,
//       0
//     );
//     endDate.setHours(23, 59, 59, 999);
//   }

//   const dateFilter = endDate
//     ? { $gte: startDate, $lte: endDate }
//     : { $gte: startDate };

//   console.log({ dateFilter });

//   const upcomingEvents = await Event.find({
//     ownerId,
//     entityId,
//     from: dateFilter,
//   }).sort({ createdAt: -1 });

//   upcomingEvents.forEach((event) => {
//     if (event.image) {
//       event.image = generatePresignedUrl(event.image);
//     }
//   });
//   console.log({ sssss: upcomingEvents });

//   return upcomingEvents;
// };

module.exports.getUpcomingEvents = async (req) => {
  const currentDateTime = new Date();
  const {
    ownerId,
    entityId,
    query: { filterBy, year, month },
  } = req;

  let startDate = new Date(currentDateTime);
  startDate.setHours(0, 0, 0, 0);
  let endDate = null;

  if (year && month) {
    const yearNum = parseInt(year, 10);
    const monthNum = parseInt(month, 10);

    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      throw new Error("Invalid year or month format.");
    }

    const firstDayOfMonth = new Date(yearNum, monthNum - 1, 1, 0, 0, 0, 0);
    const lastDayOfMonth = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);

    startDate =
      yearNum === currentDateTime.getFullYear() &&
      monthNum === currentDateTime.getMonth() + 1
        ? currentDateTime
        : firstDayOfMonth;

    endDate = lastDayOfMonth;
  } else if (filterBy === "week") {
    const diffToNextDay = 1;
    const startFromTomorrow = new Date(currentDateTime);
    startFromTomorrow.setDate(currentDateTime.getDate() + diffToNextDay);
    startFromTomorrow.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(currentDateTime);
    endOfWeek.setDate(
      currentDateTime.getDate() + (7 - currentDateTime.getDay()) - 1
    );
    endOfWeek.setHours(23, 59, 59, 999);

    startDate = startFromTomorrow;
    endDate = endOfWeek;
  } else if (filterBy === "month") {
    const currentYear = currentDateTime.getFullYear();
    const currentMonth = currentDateTime.getMonth();

    const startFromTomorrow = new Date(currentDateTime);
    startFromTomorrow.setDate(currentDateTime.getDate() + 1);
    startFromTomorrow.setHours(0, 0, 0, 0);

    const endOfMonth = new Date(
      currentYear,
      currentMonth + 1,
      0,
      23,
      59,
      59,
      999
    );

    startDate = startFromTomorrow;
    endDate = endOfMonth;
  }

  const dateFilter = { $gte: startDate };
  if (endDate) {
    dateFilter.$lte = endDate;
  }

  console.log({ dateFilter });

  const upcomingEvents = await Event.find({
    ownerId,
    entityId,
    from: dateFilter,
  })
    .populate({
      path: "counterIds",
      select: "counterName",
      model: "Counter",
    })
    .sort({ from: 1 })
    .lean();

  upcomingEvents.forEach((event) => {
    if (event.image) {
      event.image = generatePresignedUrl(event.image);
    }
    event.counters = event.counterIds.map((counter) => ({
      counterId: counter._id,
      counterName: counter.counterName,
    }));
    delete event.counterIds;
  });

  return upcomingEvents;
};

module.exports.getDistinctYears = async (req) => {
  const ownerId = req.userId;
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

// module.exports.getOngoingEventDetails = async (req) => {
//   const currentTime = new Date();

//   const events = await Event.find(
//     {
//       from: { $lte: currentTime },
//       to: { $gte: currentTime },
//       entityId: req.entityId,
//     },
//     null,
//     { sort: { from: -1 }, lean: true }
//   );
//   console.log({ events });

//   const eventIds = new Map();

//   const ongoingEvents = events?.filter((event) => {
//     if (event.isRepetitive === true) {
//       const day = currentTime.getDay();
//       if (!event.repetitiveDays || event.repetitiveDays[day] === false) {
//         return false;
//       }
//     }

//     eventIds.set(event._id.toString(), {
//       isRepetitive: event.isRepetitive,
//       from: event.from,
//       to: event.to,
//       eventName: event.eventName,
//       activeUsers: event.activeUsers,
//       ageLimit: event.ageLimit,
//       image: generatePresignedUrl(event.image),
//     });
//     return true;
//   });
//   console.log({ ongoingEvents: ongoingEvents });

//   const startingTime = new Date();
//   startingTime.setHours(0, 0, 0, 0);
//   const endingTime = new Date();
//   endingTime.setDate(endingTime.getDate() + 1);
//   endingTime.setHours(0, 0, 0, 0);

//   const ordersOfEvents = await Order.find({
//     eventId: { $in: Array.from(eventIds.keys()) },
//   });
//   console.log({ ordersOfEvents: ordersOfEvents });

//   const ongoingEventDetailsWithOrders = ordersOfEvents?.reduce((acc, order) => {
//     const eventKey = order.eventId.toString();

//     if (!acc[eventKey]) {
//       const eventDetails = eventIds.get(eventKey);
//       acc[eventKey] = {
//         eventId: order.eventId,
//         from: eventDetails.from,
//         to: eventDetails.to,
//         eventName: eventDetails.eventName,
//         activeUsers: eventDetails.activeUsers,
//         totalOrders: 0,
//         ageLimit: eventDetails.ageLimit,
//         image: generatePresignedUrl(eventDetails.image),
//       };
//     }
//     acc[eventKey].totalOrders += 1;
//     return acc;
//   }, {});

//   return [ongoingEventDetailsWithOrders, ongoingEvents];
// };

module.exports.getOngoingEventDetails = async (req) => {
  const currentTime = new Date();

  const events = await Event.find(
    {
      from: { $lte: currentTime },
      to: { $gte: currentTime },
      entityId: req.entityId,
    },
    null,
    { sort: { from: -1 } }
  )
    .populate({
      path: "counterIds",
      select: "counterName",
      model: "Counter",
    })
    .lean();

  const eventDetailsMap = new Map();

  const ongoingEvents = events.filter((event) => {
    if (event.isRepetitive) {
      const currentUTCday = currentTime.getUTCDay();

      if (
        !Array.isArray(event.repetitiveDays) ||
        event.repetitiveDays.length !== 7
      ) {
        return false;
      }

      // const adjustedRepetitiveDays = [
      //   event.repetitiveDays[6],
      //   ...event.repetitiveDays.slice(0, 6),
      // ];
      // console.log({adjustedRepetitiveDays});

      if (event.repetitiveDays[currentUTCday] !== 1) {
        return false;
      }
    }

    eventDetailsMap.set(event._id.toString(), {
      _id: event._id,
      from: event.from,
      to: event.to,
      eventName: event.eventName,
      activeUsers: event.activeUsers || 0,
      ageLimit: event.ageLimit,
      image: generatePresignedUrl(event.image),
      totalOrders: 0,
      counters: event.counterIds.map((counter) => ({
        counterId: counter._id,
        counterName: counter.counterName,
      })),
    });

    return true;
  });

  console.log({ ongoingEvents });

  if (!eventDetailsMap.size) return [];

  const orders = await Order.find({
    eventId: { $in: Array.from(eventDetailsMap.keys()) },
  });

  orders.forEach((order) => {
    const eventKey = order.eventId.toString();
    if (eventDetailsMap.has(eventKey)) {
      eventDetailsMap.get(eventKey).totalOrders += 1;
    }
  });

  return Array.from(eventDetailsMap.values());
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

  return distinctMonthsAndYears.map((doc) => ({
    year: doc._id.year,
    month: doc._id.month,
  }));
};

module.exports.getMonthlyEventDetails = async (req) => {
  const { month, year } = req.query;

  // Set start and end of the month
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0);

  // Fetch events that intersect with the given month
  const eventsForThatMonth = await Event.find({
    $or: [{ from: { $lte: endOfMonth }, to: { $gte: startOfMonth } }],
    entityId: req.entityId,
  });

  const repetitiveEvents = [];
  const singleDayEvents = [];

  // Separate events based on isRepetitive
  eventsForThatMonth.forEach((event) => {
    if (event.isRepetitive) {
      repetitiveEvents.push(event);
    } else {
      singleDayEvents.push(event);
    }
  });

  // Aggregate orders for single-day events only
  const singleDayEventIds = singleDayEvents.map((event) => event._id);
  const ordersOfSingleDayEvents = await Order.aggregate([
    { $match: { eventId: { $in: singleDayEventIds } } },
    {
      $group: {
        _id: "$eventId",
        totalOrders: { $sum: 1 },
        totalAmount: { $sum: "$totalAmount" },
        orders: { $push: "$$ROOT" },
      },
    },
  ]);

  // Map single-day event details with aggregated data
  const singleDayEventDetails = singleDayEvents.map((event) => {
    const orderSummary = ordersOfSingleDayEvents.find(
      (summary) => summary._id.toString() === event._id.toString()
    ) || { totalOrders: 0, totalAmount: 0, orders: [] };

    return {
      id: event._id,
      name: event.eventName,
      eventDate: event.startingDate,
      totalOrders: orderSummary.totalOrders,
      totalAmount: orderSummary.totalAmount,
      isRepetitive: event.isRepetitive,
      orders: orderSummary.orders,
    };
  });

  // Map repetitive events without aggregation (since no totals are needed)
  const repetitiveEventDetails = repetitiveEvents.map((event) => ({
    id: event._id,
    name: event.eventName,
    isRepetitive: event.isRepetitive,
    repetitiveDays: event.repetitiveDays,
  }));

  // Return the event details
  return {
    repetitiveEventDetails,
    singleDayEventDetails,
  };
};

module.exports.getEventsByMonthAndYear = async (req, res) => {
  const {
    entityId,
    query: { month, year },
  } = req;

  if (!month || !year) {
    return res
      .status(STATUS_CODES.BAD_REQUEST)
      .json({ message: "Month and year are required" });
  }

  const monthNum = parseInt(month, 10);
  const yearNum = parseInt(year, 10);

  if (isNaN(monthNum) || isNaN(yearNum)) {
    return res
      .status(STATUS_CODES.BAD_REQUEST)
      .json({ message: "Invalid month or year format" });
  }

  const startDate = new Date(yearNum, monthNum - 1, 1, 0, 0, 0, 0);
  const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);

  const currentDate = new Date();

  const events = await Event.find({
    entityId,
    from: { $gte: startDate, $lte: endDate },
  })
    .populate({
      path: "counterIds",
      select: "counterName",
      model: "Counter",
    })
    .sort({ from: -1 });

  const pastEvents = events.filter((event) => new Date(event.to) < currentDate);

  const eventsWithOrders = await Promise.all(
    pastEvents.map(async (event) => {
      const totalOrders = await Order.countDocuments({ eventId: event._id });
      return { ...event.toObject(), totalOrders };
    })
  );

  return eventsWithOrders;
};

module.exports.getMenuCategory = async (req) => {
  const menuCategories = await MenuCategory.find(
    { entityId: req.entityId },
    { entityId: 0, createdAt: 0, updatedAt: 0 },
    { sort: { _id: -1 }, lean: true }
  ).populate({
    path: "counterId",
    select: "counterName status",
    model: "Counter",
  });

  const filteredCategories = menuCategories.filter(
    (category) => category.counterId?.status === STATUS.ACTIVE
  );

  return filteredCategories;
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

module.exports.getOrderDetailsOfEvents = async (req) => {
  const { eventId } = req.query;

  // Fetch orders for the given event
  const orderDetails = await Order.find({ eventId });

  // Use a plain object to store grouped order details
  const orderGrouped = {};
  let totalAmout = 0;
  let totalTicket = 0;
  for (const order of orderDetails) {
    if (order.items && Array.isArray(order.items)) {
      for (const item of order.items) {
        if (!orderGrouped[item.itemId]) {
          const itemDetails = await MenuItem.findById(item.itemId, {
            price: 1,
            itemName: 1,
          }).lean();

          orderGrouped[item.itemId] = {
            totalAmount: 0,
            totalTicket: 0,
            singlePrice: itemDetails ? itemDetails.price : 0,
            itemName: itemDetails.itemName,
          };
        }

        // Accumulate the total amount and ticket count
        orderGrouped[item.itemId].totalAmount +=
          orderGrouped[item.itemId].singlePrice * item.quantity;
        orderGrouped[item.itemId].totalTicket += 1;
        totalAmout += orderGrouped[item.itemId].totalAmount;
        totalTicket += 1;
      }
    }
  }

  return { orderGrouped, totalAmout, totalTicket };
};

module.exports.getCounterMenuQuantites = async (req) => {
  const { itemId } = req.query;
  const itemDetails = await ItemDetails.find(
    { entityId: req.entityId, itemId },
    { counterId: 1, quantity: 1 },
    { lean: 1 }
  );
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
            quantity: itemDetail.quantity,
            // availableQuantity: itemDetail.availableQuantity,
            _id: counterDetails._id,
          });
          return;
        }
      });
      if (length == acc.length) {
        acc.push({
          counterName: counterDetails.counterName,
          quantity: 0,
          // availableQuantity: 0,
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
  const {
    isTableService,
    isSelfPickUp,
    counterId,
    totalTables,
    action,
    counterName,
  } = req.body;

  const counter = await Counter.findOne({ _id: counterId });
  if (!counter) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Counter doesn't exist.",
    });
    return;
  }

  if (action === EDIT_ACTION.EDIT) {
    if (isTableService !== undefined) counter.isTableService = isTableService;
    if (isSelfPickUp !== undefined) counter.isSelfPickUp = isSelfPickUp;
    if (totalTables !== undefined) counter.totalTables = totalTables;
    if (counterName !== undefined) counter.counterName = counterName;

    await counter.save();
  } else if (action === EDIT_ACTION.DELETE) {
    const activeOrders = await Order.findOne({
      counterId,
      status: {
        $nin: [
          globalConstants.ORDER_STATUS.COMPLETED,
          globalConstants.ORDER_STATUS.CANCELLED,
        ],
      },
    });

    if (activeOrders) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "Counter cannot be deleted as it has active orders.",
      });
      return;
    }

    await Counter.updateOne(
      { _id: counterId },
      { $set: { status: STATUS.DELETED } }
    );
  }
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

module.exports.createDiscountCoupon = async (req) => {
  const {
    // entityId,
    // userId,
    body: {
      code,
      type,
      value,
      maxDiscount,
      minAmount,
      usageLimit,
      startDate,
      endDate,
      entityId,
      userId,
      description,
      colourTheme,
    },
  } = req;

  const existingCoupon = await Discount.findOne({
    code,
    status: STATUS.ACTIVE,
  });
  if (existingCoupon) {
    throw new Error("Coupon code already exists");
  }

  const couponObj = {
    code,
    type,
    value,
    maxDiscount,
    minAmount,
    usageLimit,
    startDate,
    endDate,
    entityId,
    userId,
    description,
    colourTheme,
    status: STATUS.ACTIVE,
  };

  return Discount.create(couponObj);
};

module.exports.getDiscountCoupon = async (req) => {
  const { entityId, userId } = req;

  let currentDate = new Date();

  const coupons = await Discount.find({
    entityId,
    userId,
    status: STATUS.ACTIVE,
    endDate: { $gte: currentDate },
  });

  return coupons;
};

// module.exports.editBusinessDetails = async (req) => {
//   const {
//     entityId,
//     userId,
//     file,
//     body: {
//       email,
//       entityContactNumber,
//       password,
//       action,
//       location,
//       zipcode,
//       floor,
//       buildingName,
//       landMark,
//     },
//   } = req;

//   const entity = await EntityDetails.findOne({
//     _id: entityId,
//     userId,
//   });

//   const user = await User.findOne({ _id: userId });

//   if (!entity) {
//     throwError({
//       status: STATUS_CODES.BAD_REQUEST,
//       message: "Restaurant doesn't exists.",
//     });
//   }

//   let fileName = "";

//   if (action === EDIT_ACTION.EDIT && file) {
//     // Handle image upload
//     const fileBuffer = file.buffer;
//     fileName = `${req.entityId}_${Date.now()}_${file.originalname.replace(
//       / /g,
//       "_"
//     )}`;

//     try {
//       const data = await uploadBufferToS3(fileBuffer, fileName);
//       if (!data.Location) {
//         throwError({
//           status: STATUS_CODES.BAD_REQUEST,
//           message: "Error occurred while uploading the file",
//         });
//       }

//       // Update entity image in DB
//       await EntityDetails.updateOne(
//         { _id: entityId },
//         { $set: { image: fileName } }
//       );
//     } catch (error) {
//       throwError({
//         status: STATUS_CODES.BAD_REQUEST,
//         message: "File upload failed",
//       });
//     }
//   } else if (action === EDIT_ACTION.DELETE) {
//     try {
//       await EntityDetails.updateOne({ _id: entityId }, { $set: { image: "" } });
//     } catch (error) {
//       throwError({
//         status: STATUS_CODES.BAD_REQUEST,
//         message: "Image deletion failed",
//       });
//     }
//   }

//   if (email) {
//     user.email = email;
//     await user.save();
//   }
//   if (entityContactNumber) {
//     entity.entityContactNumber = entityContactNumber;
//     await entity.save();
//   }
//   if (password) {
//     const oldPass = await comparePassword(password, user.password);
//     if (oldPass) {
//       throwError({
//         status: STATUS_CODES.BAD_REQUEST,
//         message: "We don't accept old password as new password.",
//       });
//     }
//     const hashPassword = bcrypt.hashSync(password, 10);
//     entity.password = hashPassword;
//     await user.save();
//   }
//   if (location) {
//     entity.location = location;
//     await entity.save();
//   }
//   if (floor) {
//     entity.floor = floor;
//     await entity.save();
//   }
//   if (buildingName) {
//     entity.buildingName = buildingName;
//     await entity.save();
//   }
//   if (landMark) {
//     entity.landMark = landMark;
//     await entity.save();
//   }
//   if (zipcode) {
//     entity.zipcode = zipcode;
//     await entity.save();
//   }
// };

module.exports.editBusinessDetails = async (req) => {
  const {
    entityId,
    userId,
    file,
    body: {
      email,
      entityContactNumber,
      password,
      action,
      location,
      zipcode,
      floor,
      buildingName,
      landmark,
    },
  } = req;

  const [entity, user] = await Promise.all([
    EntityDetails.findOne({ _id: entityId, userId }),
    User.findById(userId),
  ]);

  if (!entity) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Restaurant doesn't exist.",
    });
  }

  const updateEntityFields = {};
  const updateUserFields = {};

  if (action === EDIT_ACTION.EDIT && file) {
    const fileName = `${entityId}_${Date.now()}_${file.originalname.replace(
      / /g,
      "_"
    )}`;
    try {
      const { Location } = await uploadBufferToS3(file.buffer, fileName);
      if (!Location) throw new Error("File upload failed");
      updateEntityFields.image = fileName;
    } catch (error) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "File upload failed",
      });
    }
  } else if (action === EDIT_ACTION.DELETE) {
    updateEntityFields.image = "";
  }

  if (password) {
    const isSamePassword = await comparePassword(password, user.password);
    if (isSamePassword) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "We don't accept old password as new password.",
      });
    }
    updateUserFields.password = bcrypt.hashSync(password, 10);
  }

  if (email) {
    updateEntityFields.email = email;
    updateUserFields.email = email;
  }

  if (entityContactNumber) {
    updateEntityFields.entityContactNumber = entityContactNumber;
    updateUserFields.contactNumber = entityContactNumber;
  }

  if (location) updateEntityFields.location = location;
  if (floor) updateEntityFields.floor = floor;
  if (buildingName) updateEntityFields.buildingName = buildingName;
  if (landmark) updateEntityFields.landMark = landmark;
  if (zipcode) updateEntityFields.zipcode = zipcode;

  await Promise.all([
    Object.keys(updateEntityFields).length > 0
      ? EntityDetails.updateOne({ _id: entityId }, { $set: updateEntityFields })
      : Promise.resolve(),
    Object.keys(updateUserFields).length > 0
      ? User.updateOne({ _id: userId }, { $set: updateUserFields })
      : Promise.resolve(),
  ]);
};

module.exports.getBusinessUserDetails = async (req) => {
  const { entityId, userId } = req;
  const entity = await EntityDetails.findOne({
    _id: entityId,
    userId,
    status: STATUS.ACTIVE,
  }).lean();
  const user = await User.findOne({
    _id: userId,
    status: STATUS.ACTIVE,
  }).lean();

  entity.image = generatePresignedUrl(entity.image);
  user.password = "";

  return { ...entity, ...user };
};

module.exports.addingTables = async (req) => {
  const {
    userId,
    entityId,
    body: { tableFrom, tableTo, counterIds: counterId },
  } = req;

  const entity = await EntityDetails.findById(entityId);
  console.log({ entity });
  if (!entity) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Entity doesn't exist.",
    });
  }

  const counters = await Counter.findOne({ _id: counterId });
  console.log({ counters });
  if (!counters) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Counter doesn't exist.",
    });
  }

  if (tableFrom > tableTo) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Invalid entry.",
    });
  }

  const tableNumbers = Array.from({ length: tableTo - tableFrom + 1 }, (_, i) =>
    String(tableFrom + i)
  );

  const lastTable = await Tables.findOne(
    { entityId },
    { tableSetionNo: 1 }
  ).sort({ createdAt: -1 });
  const newTableSectionNo = lastTable ? lastTable.tableSetionNo + 1 : 1;

  const tableObj = {
    tableCount: tableNumbers,
    userId,
    entityId,
    counterIds: counterId,
    tableSetionNo: newTableSectionNo,
  };
  console.log({ tableObj });

  return Tables.create(tableObj);
};

module.exports.getTables = async (req) => {
  const { entityId, userId } = req;
  const tables = await Tables.find({ userId, entityId }).populate({
    path: "counterIds",
    select: "counterName",
    model: "Counter",
  });
  if (!tables) return [];
  return tables;
};

module.exports.getUsersFeedback = async (req) => {
  const {
    entityId,
    query: { from, to },
  } = req;

  const fromDate = new Date(from);
  const toDate = new Date(to);

  toDate.setHours(23, 59, 59, 999);

  const feedbacks = await Feedbacks.find({
    entityId,
    createdAt: { $gte: fromDate, $lte: toDate },
  }).sort({ createdAt: -1 });
  return feedbacks;
};

module.exports.addFeedbackQuestions = async (req) => {
  const { entityId, userId, body } = req;

  if (!body) {
    throw new Error("Invalid request: body is missing.");
  }

  const { question, answerType, comment } = body;

  if (!ALL_ANSWER_TYPES || !Array.isArray(ALL_ANSWER_TYPES)) {
    console.error("🚨 ERROR: ALL_ANSWER_TYPES is undefined or not an array!");
    throw new Error("Internal error: Answer type list is not available.");
  }

  if (!Array.isArray(answerType)) {
    throw new Error(
      "Invalid answerType. Expected an array of valid answer types."
    );
  }

  const invalidAnswers = answerType.filter(
    (ans) => !ALL_ANSWER_TYPES.includes(ans)
  );
  if (invalidAnswers.length > 0) {
    throw new Error(
      `Invalid answerType values: ${invalidAnswers.join(
        ", "
      )}. Allowed values are: ${ALL_ANSWER_TYPES.join(", ")}`
    );
  }

  return FeedbackQuestions.create({
    userId,
    entityId,
    question,
    answerType,
    comment,
  });
};

module.exports.restaurantOpen = async (req) => {
  const {
    entityId,
    body: { isOpen },
  } = req;
  const restaurant = await EntityDetails.findById(entityId);
  if (!restaurant) {
    throwError({ status: STATUS_CODES, message: "Entity doesn't exist." });
  }
  if (!isOpen) {
    const activeOrders = await Order.countDocuments({
      entityId,
      status: {
        $nin: [
          globalConstants.ORDER_STATUS.COMPLETED,
          globalConstants.ORDER_STATUS.CANCELLED,
        ],
      },
    });

    if (activeOrders > 0) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "Restaurant cannot be closed while orders are still active.",
      });
    }
  }
  await EntityDetails.updateOne({ _id: entityId }, { $set: { isOpen } });
};

module.exports.emailExist = async (req) => {
  const emailExist = await User.distinct("email");
  const phoneExist = await User.distinct("contactNumber");

  return { emailExist, phoneExist };
};

module.exports.deleteEntityAccount = async (req) => {
  const { entityId, userId } = req;

  const entity = await EntityDetails.findOne({ _id: entityId, userId }).lean();
  if (!entity) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Entity doesn't exist or is not associated with the user.",
    });
  }

  await Promise.all([
    EntityDetails.updateOne(
      { _id: entityId },
      { $set: { status: STATUS.DELETED } }
    ),
    User.updateOne({ _id: userId }, { $set: { status: STATUS.DELETED } }),
  ]);
};
