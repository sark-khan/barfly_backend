const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const Event = require("../../Models/Event");
const InsiderElement = require("../../Models/MenuCategory");
const MenuItem = require("../../Models/MenuItem");
const crypto = require("crypto");
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
const {
  uploadBufferToS3,
  generatePresignedUrl,
  downloadBufferFromS3,
} = require("../aws-service");
const {
  shiftArrayRight,
  comparePassword,
  sendFirebaseNotification,
} = require("../../Utils/commonFunction");
const Order = require("../../Models/Order");
const Discount = require("../../Models/Discount");
const EntityDetails = require("../../Models/EntityDetails");
const User = require("../../Models/User");
const Tables = require("../../Models/Tables");
const Feedbacks = require("../../Models/UserFeedback");
const FeedbackQuestions = require("../../Models/FeedbackQuestions");
const globalConstants = require("../../Utils/globalConstants");
const ItemSearchLogs = require("../../Models/ItemSearchLogs");
const Otp = require("../../Models/Otp");
const { createMail, sendSMS } = require("../../Utils/mailer");
// const { path } = require("pdfkit");
const path = require("path");
const { io } = require("../../app");
const { messaging } = require("firebase-admin");
const { messagingPlus } = require("../../firebaseAdmin");
const SalesReport = require("../../Models/SalesReport");

const ALL_ANSWER_TYPES = globalConstants.ALL_ANSWER_TYPES;

module.exports.createCounter = async (req) => {
  const {
    counterName,
    isTableService,
    isSelfPickUp,
    tableFrom,
    tableTo,
    tableSectionName,
  } = req.body;

  if (!counterName) {
    throw {
      status: STATUS_CODES.BAD_REQUEST,
      message: "Counter name is required",
    };
  }

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

  if (Number(tableFrom) >= Number(tableTo)) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Invalid table range.",
    });
  }

  const tableNumbers = Array.from(
    { length: Number(tableTo) - Number(tableFrom) + 1 },
    (_, i) => String(Number(tableFrom) + i)
  );

  const newCounter = await Counter.create({
    counterName,
    ownerId: req.userId,
    entityId: req.entityId,
    isTableService,
    isSelfPickUp,
    status: STATUS.ACTIVE,
    tableCount: tableNumbers,
    tableSectionName,
  });

  io.to(newCounter.entityId.toString()).emit("newCounter", newCounter);

  const lastTable = await Tables.findOne(
    { entityId: req.entityId },
    { tableSetionNo: 1 }
  ).sort({ createdAt: -1 });

  const newTableSectionNo = lastTable ? lastTable.tableSetionNo + 1 : 1;

  await Tables.create({
    tableCount: tableNumbers,
    tableSectionName,
    userId: req.userId,
    entityId: req.entityId,
    counterIds: newCounter._id,
    tableSetionNo: newTableSectionNo,
    status: STATUS.ACTIVE,
  });

  const owner = await User.findOne(
    {
      _id: newCounter.ownerId,
      fcmToken: { $exists: true, $not: { $size: 0 } },
    },
    { fcmToken: 1 }
  );

  if (!owner?.fcmToken?.length) return newCounter.toObject();

  const notificationPayload = (token) => ({
    notification: {
      title: "New Counter Created",
      body: `Counter "${counterName}" is now available.`,
    },
    data: {
      screen: "counter",
      entityId: req.entityId.toString(),
      click_action: "FLUTTER_NOTIFICATION_CLICK",
    },
    token,
    android: {
      priority: "high",
      notification: {
        click_action: "FLUTTER_NOTIFICATION_CLICK",
      },
    },
    apns: {
      payload: {
        aps: {
          content_available: true,
          alert: {
            title: "New Counter Created",
            body: `Counter "${counterName}" is now available.`,
          },
          category: "FLUTTER_NOTIFICATION_CLICK",
          mutableContent: 1,
        },
      },
    },
  });

  for (const token of owner.fcmToken) {
    try {
      await messagingPlus.send(notificationPayload(token));
      console.log(`Notification sent to token: ${token}`);
    } catch (err) {
      console.error("FCM push failed for token:", token, err.message);

      // Optional: Remove invalid tokens
      if (
        err.code === "messaging/invalid-argument" ||
        err.code === "messaging/registration-token-not-registered" ||
        err.code === "messaging/invalid-recipient"
      ) {
        await User.updateOne(
          { _id: newCounter.ownerId },
          { $pull: { fcmToken: token } }
        );
      }
    }
  }

  return newCounter.toObject();
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

  io.to(createdCategories[0].entityId.toString()).emit(
    "newCategory",
    createdCategories
  );

  return createdCategories;
};

module.exports.getCounters = async (req) => {
  const {
    userId,
    entityId,
    query: { isItemRequired = "false", isSettings = "false" },
  } = req;

  const query = { ownerId: userId, entityId };

  if (isSettings === "true") {
    query.$or = [{ status: STATUS.ACTIVE }, { status: STATUS.INACTIVE }];
  } else {
    query.status = STATUS.ACTIVE;
  }
  const fetchCounters = await Counter.find(query, {
    counterName: 1,
    isSelfPickUp: 1,
    isTableService: 1,
    tableCount: 1,
    status: 1,
    tableSectionName: 1,
  })
    .sort({ createdAt: -1 })
    .lean();

  const counters = fetchCounters.map((counter) => {
    const ids = counter.counterIds || [];
    const newCounterIds =
      ids.length === 0
        ? []
        : ids.length === 1
        ? [ids[0]]
        : [ids[0], ids[ids.length - 1]];

    return {
      ...counter,
      counterIds: newCounterIds,
    };
  });

  if (isItemRequired !== "true") {
    return counters;
  }

  // Fetch active counters' IDs
  const activeCounterIds = counters.map((counter) => counter._id.toString());

  // Fetch items that have at least one active counter
  const items = await ItemDetails.find(
    { entityId },
    { itemName: 1, inStock: 1, counterIds: 1 }
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
          inStock: item.inStock,
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
        inStock: true,
        quantity,
      });
    })
  );

  io.to(createdItems[0].entityId.toString()).emit("newItem", createdItems);

  sendFirebaseNotification({
    titleText: "New item added",
    body: "New Item Added in the menu list",
    data: {
      action: "item created",
      click_action: "FLUTTER_NOTIFICATION_CLICK",
    },
    token: "",
    showNotification: false,
  });

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
      inStock,
      counterIds,
      unit,
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
    if (itemName !== undefined) item.itemName = itemName;
    if (price !== undefined) item.price = price;
    if (description !== undefined) item.description = description;
    if (nutritionType !== undefined) item.nutritionType = nutritionType;
    if (currency !== undefined) item.currency = currency;
    if (quantity !== undefined) item.quantity = quantity;
    if (counterIds !== undefined) item.counterIds = counterIds;
    if (inStock !== undefined) item.inStock = inStock;
    if (unit !== undefined) item.unit = unit;

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

    await item.save();
    io.to(item.entityId.toString()).emit("menuItemUpdated", item);
  } else if (action === EDIT_ACTION.DELETE) {
    await ItemDetails.deleteOne({ _id: itemId });
    io.to(item.entityId.toString()).emit("menuItemUpdated", { itemId });
  }
};

module.exports.getCreatedItems = async (req) => {
  const {
    entityId,
    query: {
      itemId,
      menuCategoryId,
      pageNo = 1,
      pageLimit = 8,
      inStock,
      searchTerm,
      searchedId,
    },
  } = req;

  if (itemId) {
    const item = await ItemDetails.findOne({ _id: itemId, entityId })
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

    if (!item || item.menuCategoryId?.counterId?.status !== STATUS.ACTIVE) {
      return { itemsList: [], totalCount: 0 };
    }

    const itemWithImage = {
      ...item,
      image: item.image ? generatePresignedUrl(item.image) : null,
    };

    return { itemsList: [itemWithImage], totalCount: 1 };
  }

  const query = { entityId };

  if (searchedId && !menuCategoryId) {
    query._id = { $ne: searchedId }; // Exclude the searchedId from the main query results
  }

  if (menuCategoryId) {
    query.menuCategoryId = menuCategoryId;
  }

  if (inStock) {
    query.inStock = inStock;
  }

  if (searchTerm) {
    query.itemName = { $regex: searchTerm, $options: "i" };
  }

  const createdItems = await ItemDetails.find(query)
    .sort({ _id: -1 })
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

  if (searchedId && pageNo == 1 && !menuCategoryId) {
    const searchedIdItem = await ItemDetails.findById(searchedId)
      .sort({ _id: -1 })
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
    if (searchedIdItem) {
      createdItems.unshift(searchedIdItem); // Use unshift() to add item to the start of the array
    }
  }

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
      // ageLimit,
      location,
    },
  } = req;

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
    // ageLimit,
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
  let currentUTCday = currentTime.getUTCDay();

  currentUTCday = currentUTCday === 0 ? 6 : currentUTCday - 1;

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
      if (
        !Array.isArray(event.repetitiveDays) ||
        event.repetitiveDays.length !== 7
      ) {
        console.log(
          `Treating non-repetitive event (invalid repetitiveDays): ${event.eventName}`
        );
        return true;
      }

      if (event.repetitiveDays[currentUTCday] !== 1) {
        console.log(
          `Skipping event as it doesn't repeat today: ${event.eventName}`
        );
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

  events.map((event) => {
    if (!event.image) {
      return event;
    }
    event.image = generatePresignedUrl(event.image);
    return event;
  });

  const pastEvents = events.filter((event) => new Date(event.to) < currentDate);

  const eventsWithOrders = await Promise.all(
    pastEvents.map(async (event) => {
      const totalOrders = await Order.countDocuments({ eventId: event._id });
      return { ...event.toObject(), totalOrders };
    })
  );

  return eventsWithOrders;
};

module.exports.getCounterAndCategory = async (req) => {
  const { userId, entityId } = req;
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

  const query = { ownerId: userId, entityId };

  query.status = STATUS.ACTIVE;
  const counters = await Counter.find(query, {
    counterName: 1,
    // isSelfPickUp: 1,
    // isTableService: 1,
    // tableCount: 1,
    status: 1,
    // tableSectionName: 1,
  })
    .sort({ createdAt: -1 })
    .lean();

  return { filteredCategories, counters };
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
    action,
    counterName,
    status,
    tableSectionName,
    tableFrom,
    tableTo,
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
    if (counterName) {
      const duplicate = await Counter.findOne({
        _id: { $ne: counterId },
        counterName: { $regex: `^${counterName}$`, $options: "i" },
        status: { $ne: STATUS.DELETED },
      });

      if (duplicate) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: "Counter name already exists. Please try new one.",
        });
        return;
      }
    }

    if (isTableService !== undefined) counter.isTableService = isTableService;
    if (isSelfPickUp !== undefined) counter.isSelfPickUp = isSelfPickUp;
    if (counterName !== undefined) counter.counterName = counterName;
    if (status !== undefined) counter.status = status;

    if (counter.tableSectionName === tableSectionName) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "Table with this name already exists.",
      });
    }

    if (tableSectionName !== undefined)
      counter.tableSectionName = tableSectionName;

    const currentFrom = Number(counter.tableCount?.[0] || 0);
    const currentTo = Number(
      counter.tableCount?.[counter.tableCount.length - 1] || 0
    );

    const newFrom = tableFrom !== undefined ? Number(tableFrom) : currentFrom;
    const newTo = tableTo !== undefined ? Number(tableTo) : currentTo;

    if (newFrom >= newTo) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "Invalid table range.",
      });
      return;
    }

    if (tableFrom !== undefined || tableTo !== undefined) {
      const tableNumbers = Array.from({ length: newTo - newFrom + 1 }, (_, i) =>
        String(newFrom + i)
      );
      counter.tableCount = tableNumbers;
    }

    await counter.save();
    io.to(counter.entityId.toString()).emit("counterUpdate", { counterId });

    if (
      tableSectionName !== undefined ||
      tableFrom !== undefined ||
      tableTo !== undefined
    ) {
      const tableNumbers = counter.tableCount;

      const conflictingTables = await Tables.find({
        counterIds: counter._id,
        status: { $ne: STATUS.DELETED },
      });

      const isConflict = conflictingTables.some(
        (table) => table.counterIds.length > 1
      );

      if (isConflict) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message:
            "There are multiple counters involved, available for one counter attached.",
        });
        return;
      }

      const existingTable = await Tables.findOne({
        counterIds: counter._id,
        status: { $ne: STATUS.DELETED },
      });

      if (!existingTable) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: "No table found for this counter to update.",
        });
        return;
      }

      existingTable.tableCount = tableNumbers;
      if (tableSectionName !== undefined) {
        existingTable.tableSectionName = tableSectionName;
      }

      await existingTable.save();
    }
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
    io.to(counter.entityId.toString()).emit("counterUpdate", { counterId });
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
    entityId,
    userId,
    body: {
      code,
      type,
      value,
      maxDiscount,
      minAmount,
      usageLimit,
      startDate,
      endDate,
      // entityId,
      // userId,
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
//       landmark,
//       plotNo,
//     },
//   } = req;

//   const [entity, user] = await Promise.all([
//     EntityDetails.findOne({ _id: entityId, userId }),
//     User.findById(userId),
//   ]);

//   if (!entity) {
//     throwError({
//       status: STATUS_CODES.BAD_REQUEST,
//       message: "Restaurant doesn't exist.",
//     });
//   }

//   const updateEntityFields = {};
//   const updateUserFields = {};

//   if (action === EDIT_ACTION.EDIT && file) {
//     const fileName = `${entityId}_${Date.now()}_${file.originalname.replace(
//       / /g,
//       "_"
//     )}`;
//     try {
//       const { Location } = await uploadBufferToS3(file.buffer, fileName);
//       if (!Location) throw new Error("File upload failed");
//       updateEntityFields.image = fileName;
//     } catch (error) {
//       throwError({
//         status: STATUS_CODES.BAD_REQUEST,
//         message: "File upload failed",
//       });
//     }
//   } else if (action === EDIT_ACTION.DELETE) {
//     updateEntityFields.image = "";
//   }

//   if (password) {
//     const isSamePassword = await comparePassword(password, user.password);
//     if (isSamePassword) {
//       throwError({
//         status: STATUS_CODES.BAD_REQUEST,
//         message: "We don't accept old password as new password.",
//       });
//     }
//     updateUserFields.password = bcrypt.hashSync(password, 10);
//   }

//   if (email) {
//     updateEntityFields.email = email;
//     updateUserFields.email = email;
//   }

//   if (entityContactNumber) {
//     updateEntityFields.entityContactNumber = entityContactNumber;
//     updateUserFields.contactNumber = entityContactNumber;
//   }

//   if (location) updateEntityFields.location = location;
//   if (floor) updateEntityFields.floor = floor;
//   if (buildingName) updateEntityFields.buildingName = buildingName;
//   if (landmark) updateEntityFields.landMark = landmark;
//   if (zipcode) updateEntityFields.zipcode = zipcode;
//   if (plotNo) updateEntityFields.plotNo = plotNo;

//   await Promise.all([
//     Object.keys(updateEntityFields).length > 0
//       ? EntityDetails.updateOne({ _id: entityId }, { $set: updateEntityFields })
//       : Promise.resolve(),
//     Object.keys(updateUserFields).length > 0
//       ? User.updateOne({ _id: userId }, { $set: updateUserFields })
//       : Promise.resolve(),
//   ]);
// };

module.exports.editBusinessDetails = async (req) => {
  const {
    userId,
    entityId,
    file,
    body: {
      email,
      contactNumber,
      newPassword,
      enteredOtp,
      entityContactNumber,
      action,
      location,
      zipcode,
      floor,
      buildingName,
      landmark,
      plotNo,
    },
  } = req;

  let message = "";
  const updateEntityFields = {};

  if (newPassword) {
    const userPass = await User.findOne({ _id: userId });
    if (!userPass) {
      throwError({
        status: STATUS_CODES.NOT_FOUND,
        message: "User not found.",
      });
    }

    const passwordCompare = await comparePassword(
      newPassword,
      userPass.password
    );
    if (passwordCompare) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "We don't accept old password as new password.",
      });
    }

    const passwordChange = bcrypt.hashSync(newPassword, 10);
    userPass.password = passwordChange;
    await userPass.save();

    message = "Password updated successfully.";
    io.to(entityId.toString()).emit("passwordUpdated", { message });
    return { message };
  }

  const entity = await EntityDetails.findOne({
    _id: entityId,
    status: STATUS.ACTIVE,
  }).lean();
  if (!entity) {
    throwError({
      status: STATUS_CODES.NOT_FOUND,
      message: "Entity not found.",
    });
  }

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

  if (location) updateEntityFields.location = location;
  if (floor) updateEntityFields.floor = floor;
  if (buildingName) updateEntityFields.buildingName = buildingName;
  if (landmark) updateEntityFields.landMark = landmark;
  if (zipcode) updateEntityFields.zipcode = zipcode;
  if (plotNo) updateEntityFields.plotNo = plotNo;

  // await EntityDetails.updateOne({ _id: entityId }, updateEntityFields);
  if (Object.keys(updateEntityFields).length) {
    await EntityDetails.updateOne({ _id: entityId }, updateEntityFields);
    io.to(entityId.toString()).emit("entityDetailsUpdated", updateEntityFields);
  }

  const unifiedContactNumber = contactNumber || entityContactNumber;
  if (unifiedContactNumber) {
    if (!enteredOtp) {
      const otp = crypto.randomInt(100000, 999999).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      await Otp.findOneAndUpdate(
        { contactNumber: unifiedContactNumber },
        { otp, userId, expiresAt },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const msg = `Your OTP for updating contact number on Countr is: ${otp} (Valid for 5 minutes)`;

      await sendSMS({ toPhoneNumber: unifiedContactNumber, message: msg });

      await User.updateOne(
        { _id: userId },
        { contactNumber: unifiedContactNumber, contactOtpVerified: false }
      );
      message = "OTP sent to your new contact number.";
      return { message, otp, otpSent: true };
    } else {
      const otpRecord = await Otp.findOne({
        contactNumber: unifiedContactNumber,
      });
      if (
        !otpRecord ||
        otpRecord.otp != enteredOtp ||
        new Date() > otpRecord.expiresAt
      ) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: "Invalid OTP or OTP expired.",
        });
      }
      await Otp.deleteOne({ contactNumber: unifiedContactNumber });
      await User.updateOne(
        { _id: userId },
        { contactNumber: unifiedContactNumber, contactOtpVerified: true }
      );

      updateEntityFields.contactNumber = unifiedContactNumber;
      updateEntityFields.entityContactNumber = unifiedContactNumber;

      await EntityDetails.updateOne(
        { _id: entityId },
        { entityContactNumber: unifiedContactNumber, contactOtpVerified: true }
      );

      message = "Contact number updated successfully.";
      io.to(entityId.toString()).emit("contactNumberUpdated", {
        contactNumber: unifiedContactNumber,
      });
      return { message, otpVerified: true };
    }
  }

  if (email) {
    if (!enteredOtp) {
      const query = { status: STATUS.ACTIVE };
      if (email) query.email = email;

      const user = await User.findOne(query);
      if (user) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: `Email ${email} already exists.`,
        });
      }
      const otp = crypto.randomInt(100000, 999999).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      await Otp.findOneAndUpdate(
        { email },
        { otp, userId, expiresAt },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const mail_data = {
        to: email,
        subject: "COUNTR: OTP for Email Update",
        text: `Please use the below OTP to verify your identity for updating your email on Countr: \n\n ${otp} \n\n (Valid for 5 minutes)`,
      };
      createMail(mail_data);
      await User.updateOne({ _id: userId }, { emailOtpVerified: false });

      return { message: "OTP sent to your new email.", otp, otpSent: true };
    } else {
      const otpRecord = await Otp.findOne({ email });
      if (
        !otpRecord ||
        otpRecord.otp != enteredOtp ||
        new Date() > otpRecord.expiresAt
      ) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: "Invalid OTP or OTP expired.",
        });
      }
      await Otp.deleteOne({ email });
      await User.updateOne({ _id: userId }, { email, emailOtpVerified: true });
      // return { message: "Email updated successfully.", otpVerified: true };

      message = "Email updated successfully.";
      io.to(entityId.toString()).emit("emailUpdated", { email });
      return { message, otpVerified: true };
    }
  }

  return { message: "Business details updated successfully." };
};

module.exports.getBusinessUserDetails = async (req) => {
  const { entityId, userId } = req;
  const entity = await EntityDetails.findOne(
    {
      _id: entityId,
      userId,
      status: STATUS.ACTIVE,
    },
    { owner: 0, userId: 0 }
  ).lean();
  const user = await User.findOne(
    {
      _id: userId,
      status: STATUS.ACTIVE,
    },
    { fcmToken: 0 }
  ).lean();

  entity.image = generatePresignedUrl(entity.image);
  user.password = "";

  return { ...entity, ...user };
};

module.exports.addingTables = async (req) => {
  const {
    userId,
    entityId,
    body: { tableFrom, tableTo, counterIds, tableSectionName },
  } = req;

  const entity = await EntityDetails.findById(entityId);
  if (!entity) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Entity doesn't exist.",
    });
  }

  if (!Array.isArray(counterIds) || counterIds.length === 0) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "At least one counter ID must be provided.",
    });
  }

  const counters = await Counter.find({ _id: { $in: counterIds } });
  if (counters.length !== counterIds.length) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "One or more counters do not exist.",
    });
  }

  if (Number(tableFrom) >= Number(tableTo)) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Invalid table range.",
    });
  }

  const tableNumbers = Array.from(
    { length: Number(tableTo) - Number(tableFrom) + 1 },
    (_, i) => String(Number(tableFrom) + i)
  );

  const tablesExists = await Tables.find({
    counterIds: { $in: counterIds },
    status: { $ne: STATUS.DELETED },
  });

  if (tablesExists.length > 0) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Table service is already created for the following counters",
    });
  }
  const lastTable = await Tables.findOne(
    { entityId },
    { tableSetionNo: 1, tableSectionName: 1 }
  ).sort({ createdAt: -1 });

  const newTableSectionNo = lastTable ? lastTable.tableSetionNo + 1 : 1;
  if (lastTable?.tableSectionName === tableSectionName) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Table with this name already exists.",
    });
  }

  const tableObj = {
    tableCount: tableNumbers,
    userId,
    entityId,
    counterIds,
    tableSetionNo: newTableSectionNo,
    tableSectionName,
    status: STATUS.ACTIVE,
  };

  const newTable = await Tables.create(tableObj);
  io.to(newTable.entityId.toString()).emit("newTable", newTable);

  await Counter.updateMany(
    { _id: { $in: counterIds } },
    {
      $set: {
        tableSectionName,
        tableCount: tableNumbers,
      },
    }
  );

  return newTable;
};

module.exports.getCountersForTableManagement = async (req) => {
  const { entityId } = req;

  const tableManagement = await Tables.find({ entityId }).lean();

  const counterIds = new Set();

  tableManagement.forEach((table) => {
    if (table.status == STATUS.DELETED) return;
    table.counterIds.forEach((counterId) => {
      counterIds.add(counterId);
    });
  });

  const counterList = await Counter.find({
    _id: { $nin: Array.from(counterIds) },
    entityId: entityId,
    status: STATUS.ACTIVE,
  });

  return counterList;
};

module.exports.getCountersForEvents = async (req) => {
  const { eventId } = req.query;

  const eventDetails = await Event.findById(eventId, { counterIds: 1 }).lean();

  if (
    !eventDetails ||
    !eventDetails.counterIds ||
    eventDetails.counterIds.length === 0
  ) {
    return [];
  }

  const counterList = await Counter.find({
    _id: { $in: eventDetails.counterIds },
  });

  return counterList;
};

module.exports.getTables = async (req) => {
  const { entityId, userId } = req;

  const tables = await Tables.find({
    userId,
    entityId,
    status: STATUS.ACTIVE,
  })
    .populate({
      path: "counterIds",
      select: "counterName",
      model: "Counter",
    })
    .select("tableCount tableSectionName tableSetionNo counterIds")
    .sort({ createdAt: -1 });

  if (!tables) return [];

  return tables;
};

module.exports.editTable = async (req) => {
  const {
    tableId,
    action,
    tableSectionName,
    tableFrom,
    tableTo,
    counterIds,
    status,
  } = req.body;

  let message = "";

  const tableData = await Tables.findById(tableId);
  if (!tableData) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Table not found.",
    });
  }

  if (action === EDIT_ACTION.EDIT) {
    if (tableData.tableSectionName === tableSectionName) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "Table with this name already exists.",
      });
    }
    if (tableSectionName !== undefined) {
      tableData.tableSectionName = tableSectionName;
    }

    if (counterIds !== undefined) {
      if (!Array.isArray(counterIds) || counterIds.length === 0) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: "At least one counter ID must be provided.",
        });
      }
      tableData.counterIds = counterIds;
    }

    const currentFrom =
      Array.isArray(tableData.tableCount) && tableData.tableCount.length > 0
        ? Number(tableData.tableCount[0])
        : 0;

    const currentTo =
      Array.isArray(tableData.tableCount) && tableData.tableCount.length > 0
        ? Number(tableData.tableCount[tableData.tableCount.length - 1])
        : 0;

    const newFrom = tableFrom !== undefined ? Number(tableFrom) : currentFrom;
    const newTo = tableTo !== undefined ? Number(tableTo) : currentTo;

    if (newFrom >= newTo) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "Invalid table range.",
      });
    }

    let updatedTableCount;
    if (tableFrom !== undefined || tableTo !== undefined) {
      updatedTableCount = Array.from({ length: newTo - newFrom + 1 }, (_, i) =>
        String(newFrom + i)
      );
      tableData.tableCount = updatedTableCount;
    }

    const counterUpdate = {};
    if (tableSectionName !== undefined)
      counterUpdate.tableSectionName = tableData.tableSectionName;
    if (updatedTableCount !== undefined)
      counterUpdate.tableCount = updatedTableCount;

    if (Object.keys(counterUpdate).length > 0 && tableData.counterIds?.length) {
      await Counter.updateMany(
        { _id: { $in: tableData.counterIds } },
        { $set: counterUpdate }
      );
    }
    message = "Table edited successfully.";
    io.to(tableData.entityId.toString()).emit("tableUpdate", { tableId });
    await tableData.save();
  } else if (action === EDIT_ACTION.DELETE) {
    if (!Array.isArray(counterIds) || counterIds.length === 0) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "At least one counter ID must be provided for deletion.",
      });
    }

    const counters = await Counter.find({ _id: { $in: counterIds } });

    if (!counters.length) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "No matching counters found.",
      });
    }

    const anyTableService = counters.some((counter) => counter.isTableService);

    if (anyTableService) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message:
          "Cannot delete table. One or more counters have table service enabled.",
      });
    }

    tableData.status = status;

    await tableData.save();
    // await Counter.updateMany(
    //   { _id: { $in: counterIds } },
    //   { $set: { status } }
    // );
    message = "Table deleted successfully.";
  }
  return { message };
};

// module.exports.getUsersFeedback = async (req) => {
//   const {
//     entityId,
//     query: { from, to },
//   } = req;

//   let fromDate = from ? new Date(from) : null;
//   let toDate = to ? new Date(to) : null;
//   if (toDate) toDate.setHours(23, 59, 59, 999);

//   const dateFilter = {};
//   if (fromDate instanceof Date && !isNaN(fromDate)) {
//     dateFilter.$gte = fromDate;
//   }
//   if (toDate instanceof Date && !isNaN(toDate)) {
//     dateFilter.$lte = toDate;
//   }

//   const query = { entityId };
//   if (Object.keys(dateFilter).length) {
//     query.createdAt = dateFilter;
//   }

//   const feedbacks = await Feedbacks.find(query)
//     .populate({
//       path: "answers.questionId",
//       select: "question answerType",
//     })
//     .sort({ createdAt: -1 });

//   const feedbackStats = {};

//   const ratingValues = globalConstants.ANSWER_TYPES.RATING.map(String);
//   const feedbackValues = globalConstants.ANSWER_TYPES.FEEDBACK.map((v) =>
//     v.toUpperCase()
//   );
//   const booleanValues = globalConstants.ANSWER_TYPES.BOOLEAN.map((v) =>
//     v.toUpperCase()
//   );

//   for (const fb of feedbacks) {
//     for (const answer of fb.answers) {
//       const { value, questionId } = answer;
//       if (!value || !questionId) continue;

//       const valueStr =
//         typeof value === "string"
//           ? value.trim().toUpperCase()
//           : String(value).trim().toUpperCase();

//       const questionStats = feedbackStats[questionId._id] || {
//         question: questionId.question,
//         RATING: { total: 0, count: 0, values: {} },
//         FEEDBACK: { GOOD: 0, DECENT: 0, BAD: 0 },
//         BOOLEAN: { TRUE: 0, FALSE: 0, NEUTRAL: 0 },
//       };

//       if (ratingValues.includes(valueStr)) {
//         const ratingValue = parseInt(valueStr, 10);
//         if (!isNaN(ratingValue) && ratingValue >= 1 && ratingValue <= 10) {
//           questionStats.RATING.total += ratingValue;
//           questionStats.RATING.count += 1;
//           questionStats.RATING.values[ratingValue] =
//             (questionStats.RATING.values[ratingValue] || 0) + 1;
//         }
//       } else if (feedbackValues.includes(valueStr)) {
//         questionStats.FEEDBACK[valueStr] += 1;
//       } else if (booleanValues.includes(valueStr)) {
//         questionStats.BOOLEAN[valueStr] += 1;
//       }

//       feedbackStats[questionId._id] = questionStats;
//     }
//   }

//   const finalStats = {};
//   for (const questionId in feedbackStats) {
//     const stats = feedbackStats[questionId];

//     const totalAnswers =
//       stats.RATING.count +
//       stats.FEEDBACK.GOOD +
//       stats.FEEDBACK.DECENT +
//       stats.FEEDBACK.BAD +
//       stats.BOOLEAN.TRUE +
//       stats.BOOLEAN.FALSE +
//       stats.BOOLEAN.NEUTRAL;

//     if (totalAnswers === 0) continue;

//     const avgRating =
//       stats.RATING.count > 0
//         ? (stats.RATING.total / stats.RATING.count).toFixed(2)
//         : 0;

//     const distribution = {};
//     for (let i = 1; i <= 10; i++) {
//       const valCount = stats.RATING.values[i] || 0;
//       distribution[i] = stats.RATING.count
//         ? ((valCount / stats.RATING.count) * 100).toFixed(2) + "%"
//         : "0%";
//     }

//     const totalFeedbacks =
//       stats.FEEDBACK.GOOD + stats.FEEDBACK.DECENT + stats.FEEDBACK.BAD;
//     const feedbackStatsPercentage = {
//       GOOD: totalFeedbacks
//         ? ((stats.FEEDBACK.GOOD / totalFeedbacks) * 100).toFixed(2) + "%"
//         : "0%",
//       DECENT: totalFeedbacks
//         ? ((stats.FEEDBACK.DECENT / totalFeedbacks) * 100).toFixed(2) + "%"
//         : "0%",
//       BAD: totalFeedbacks
//         ? ((stats.FEEDBACK.BAD / totalFeedbacks) * 100).toFixed(2) + "%"
//         : "0%",
//     };

//     const totalBooleans =
//       stats.BOOLEAN.TRUE + stats.BOOLEAN.FALSE + stats.BOOLEAN.NEUTRAL;
//     const booleanStatsPercentage = {
//       TRUE: totalBooleans
//         ? ((stats.BOOLEAN.TRUE / totalBooleans) * 100).toFixed(2) + "%"
//         : "0%",
//       FALSE: totalBooleans
//         ? ((stats.BOOLEAN.FALSE / totalBooleans) * 100).toFixed(2) + "%"
//         : "0%",
//       NEUTRAL: totalBooleans
//         ? ((stats.BOOLEAN.NEUTRAL / totalBooleans) * 100).toFixed(2) + "%"
//         : "0%",
//     };

//     const type =
//       stats.RATING.count > 0
//         ? "RATING"
//         : stats.FEEDBACK.GOOD + stats.FEEDBACK.DECENT + stats.FEEDBACK.BAD > 0
//         ? "FEEDBACK"
//         : "BOOLEAN";

//     finalStats[questionId] = {
//       question: stats.question,
//       type,
//       RATING: {
//         average: avgRating,
//         distribution,
//       },
//       FEEDBACK: feedbackStatsPercentage,
//       BOOLEAN: booleanStatsPercentage,
//     };
//   }

//   return {
//     feedbacks,
//     feedbackStats: finalStats,
//   };
// };

module.exports.getUsersFeedback = async (req) => {
  const {
    entityId,
    query: { from, to, year, month },
  } = req;

  let fromDate = from ? new Date(from) : null;
  let toDate = to ? new Date(to) : null;
  if (toDate) toDate.setHours(23, 59, 59, 999);

  const dateFilter = {};
  if (fromDate instanceof Date && !isNaN(fromDate)) {
    dateFilter.$gte = fromDate;
  }
  if (toDate instanceof Date && !isNaN(toDate)) {
    dateFilter.$lte = toDate;
  }

  const query = { entityId };

  if (year && month) {
    const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    startOfMonth.setHours(0, 0, 0, 0);
    endOfMonth.setHours(23, 59, 59);
    dateFilter.$gte = startOfMonth;
    dateFilter.$lte = endOfMonth;
  }

  if (Object.keys(dateFilter).length) {
    query.createdAt = dateFilter;
  }

  const feedbacks = await Feedbacks.find(query)
    .populate({
      path: "answers.questionId",
      select: "question answerType",
    })
    .sort({ createdAt: -1 });

  const totalReviews = feedbacks.length;

  const feedbackStats = {};

  const ratingValues = globalConstants.ANSWER_TYPES.RATING.map(String);
  const feedbackValues = globalConstants.ANSWER_TYPES.FEEDBACK.map((v) =>
    v.toUpperCase()
  );
  const booleanValues = globalConstants.ANSWER_TYPES.BOOLEAN.map((v) =>
    v.toUpperCase()
  );
  let yearMonth;

  for (const fb of feedbacks) {
    yearMonth = `${fb.createdAt.getFullYear()}-${fb.createdAt.getMonth() + 1}`;
    for (const answer of fb.answers) {
      const { value, questionId } = answer;
      if (!value || !questionId) continue;

      const valueStr =
        typeof value === "string"
          ? value.trim().toUpperCase()
          : String(value).trim().toUpperCase();

      if (!feedbackStats[yearMonth]) {
        feedbackStats[yearMonth] = {};
      }

      const questionStats = feedbackStats[yearMonth][questionId._id] || {
        question: questionId.question,
        RATING: { total: 0, count: 0, values: {} },
        FEEDBACK: { GOOD: 0, DECENT: 0, BAD: 0 },
        BOOLEAN: { TRUE: 0, FALSE: 0, NEUTRAL: 0 },
      };

      if (ratingValues.includes(valueStr)) {
        const ratingValue = parseInt(valueStr, 10);
        if (!isNaN(ratingValue) && ratingValue >= 1 && ratingValue <= 10) {
          questionStats.RATING.total += ratingValue;
          questionStats.RATING.count += 1;
          questionStats.RATING.values[ratingValue] =
            (questionStats.RATING.values[ratingValue] || 0) + 1;
        }
      } else if (feedbackValues.includes(valueStr)) {
        questionStats.FEEDBACK[valueStr] += 1;
      } else if (booleanValues.includes(valueStr)) {
        questionStats.BOOLEAN[valueStr] += 1;
      }

      feedbackStats[yearMonth][questionId._id] = questionStats;
    }
  }

  let finalStats = {};

  for (const yearMonth in feedbackStats) {
    const statsByMonth = feedbackStats[yearMonth];
    finalStats[yearMonth] = {};

    for (const questionId in statsByMonth) {
      const stats = statsByMonth[questionId];

      const totalAnswers =
        stats.RATING.count +
        stats.FEEDBACK.GOOD +
        stats.FEEDBACK.DECENT +
        stats.FEEDBACK.BAD +
        stats.BOOLEAN.TRUE +
        stats.BOOLEAN.FALSE +
        stats.BOOLEAN.NEUTRAL;

      if (totalAnswers === 0) continue;

      const avgRating =
        stats.RATING.count > 0
          ? (stats.RATING.total / stats.RATING.count).toFixed(2)
          : 0;

      const distribution = {};
      for (let i = 1; i <= 10; i++) {
        const valCount = stats.RATING.values[i] || 0;
        distribution[i] = stats.RATING.count
          ? ((valCount / stats.RATING.count) * 100).toFixed(2) + "%"
          : "0%";
      }

      const totalFeedbacks =
        stats.FEEDBACK.GOOD + stats.FEEDBACK.DECENT + stats.FEEDBACK.BAD;
      const feedbackStatsPercentage = {
        GOOD: totalFeedbacks
          ? ((stats.FEEDBACK.GOOD / totalFeedbacks) * 100).toFixed(2) + "%"
          : "0%",
        DECENT: totalFeedbacks
          ? ((stats.FEEDBACK.DECENT / totalFeedbacks) * 100).toFixed(2) + "%"
          : "0%",
        BAD: totalFeedbacks
          ? ((stats.FEEDBACK.BAD / totalFeedbacks) * 100).toFixed(2) + "%"
          : "0%",
      };

      const totalBooleans =
        stats.BOOLEAN.TRUE + stats.BOOLEAN.FALSE + stats.BOOLEAN.NEUTRAL;
      const booleanStatsPercentage = {
        TRUE: totalBooleans
          ? ((stats.BOOLEAN.TRUE / totalBooleans) * 100).toFixed(2) + "%"
          : "0%",
        FALSE: totalBooleans
          ? ((stats.BOOLEAN.FALSE / totalBooleans) * 100).toFixed(2) + "%"
          : "0%",
        NEUTRAL: totalBooleans
          ? ((stats.BOOLEAN.NEUTRAL / totalBooleans) * 100).toFixed(2) + "%"
          : "0%",
      };

      const type =
        stats.RATING.count > 0
          ? "RATING"
          : stats.FEEDBACK.GOOD + stats.FEEDBACK.DECENT + stats.FEEDBACK.BAD > 0
          ? "FEEDBACK"
          : "BOOLEAN";
      finalStats[yearMonth][questionId] = {
        question: stats.question,
        type,
        RATING: {
          average: avgRating,
          distribution,
        },
        FEEDBACK: feedbackStatsPercentage,
        BOOLEAN: booleanStatsPercentage,
      };
    }
  }

  const feedbackQuestions = await FeedbackQuestions.find({
    entityId: req.entityId,
  });

  if (feedbackQuestions.length) {
    let firstMonthKey;
    let monthStats;

    if (Object.keys(finalStats).length === 0) {
      // You need to define yearMonth (maybe from req.query or current month)
      const now = new Date();
      const yearMonth = `${now.getFullYear()}-${now.getMonth() + 1}`; // e.g., "2025-4"

      firstMonthKey = yearMonth;
      finalStats = {
        [firstMonthKey]: {},
      };
      monthStats = finalStats[firstMonthKey];
    } else {
      [firstMonthKey, monthStats] = Object.entries(finalStats)[0];
    }

    feedbackQuestions.forEach((feedbackQuestion) => {
      if (!monthStats[feedbackQuestion._id]) {
        monthStats[feedbackQuestion._id] = {
          question: feedbackQuestion.question,
          type: "NO_DATA",
          createdAt: feedbackQuestion.createdAt,
          RATING: {
            average: 0,
            distribution: {
              1: "0%",
              2: "0%",
              3: "0%",
              4: "0%",
              5: "0%",
              6: "0%",
              7: "0%",
              8: "0%",
              9: "0%",
              10: "0%",
            },
          },
          FEEDBACK: {
            GOOD: "0%",
            DECENT: "0%",
            BAD: "0%",
          },
          BOOLEAN: {
            TRUE: "0%",
            FALSE: "0%",
            NEUTRAL: "0%",
          },
        };
      }
    });
  }

  // console.log({ finalStats });
  // if (finalStats && finalStats[0]) {
  //   const [firstMonthKey, monthStats] = Object.entries(finalStats)[0];
  //   console.log({ mm: monthStats, firstMonthKey });
  //   feedbackQuestions.forEach((feedbackQuestion) => {
  //     if (!monthStats[feedbackQuestion._id]) {
  //       // finalStats[firstMonthKey]
  //       finalStats[firstMonthKey][feedbackQuestion._id] = {
  //         question: feedbackQuestion.question,
  //         type: "NO_DATA",
  //         createdAt: feedbackQuestion.createdAt,
  //         RATING: {
  //           average: 0,
  //           distribution: {
  //             1: "0%",
  //             2: "0%",
  //             3: "0%",
  //             4: "0%",
  //             5: "0%",
  //             6: "0%",
  //             7: "0%",
  //             8: "0%",
  //             9: "0%",
  //             10: "0%",
  //           },
  //         },
  //         FEEDBACK: {
  //           GOOD: "0%",
  //           DECENT: "0%",
  //           BAD: "0%",
  //         },
  //         BOOLEAN: {
  //           TRUE: "0%",
  //           FALSE: "0%",
  //           NEUTRAL: "0%",
  //         },
  //       };
  //     }
  //   });
  // }

  return {
    // feedbacks,
    feedbackStats: finalStats,
    totalReviews,
  };
};

module.exports.addFeedbackQuestions = async (req) => {
  const { entityId, userId, body } = req;

  if (!body) {
    throw new Error("Invalid request: body is missing.");
  }

  const { question, answerType, comment } = body;

  if (!ALL_ANSWER_TYPES || !Array.isArray(ALL_ANSWER_TYPES)) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Answer type list is not available.",
    });
  }

  if (!Array.isArray(answerType)) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Invalid answer type. Expected an array of valid answer types.",
    });
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

  const existingQuestion = await FeedbackQuestions.findOne({
    entityId,
    question: question.trim(),
  });
  if (existingQuestion) {
    throwError({
      status: STATUS_CODES.CONFLICT,
      message: "This question already exists for the entity.",
    });
  }

  const questionCount = await FeedbackQuestions.countDocuments({ entityId });
  if (questionCount >= 5) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Maximum of 5 feedback questions are allowed per entity.",
    });
  }

  const feedback = FeedbackQuestions.create({
    userId,
    entityId,
    question: question.trim(),
    answerType,
    comment,
  });
  io.to(entityId.toString()).emit("newFeedbackQuestions", feedback);
  return feedback;
};

// module.exports.deleteFeedbackQuestions = async (req) => {
//   const { questionId, feedbackId } = req.body;

//   if (questionId) {
//     const question = await FeedbackQuestions.findOne({ _id: questionId });
//     if (!question) {
//       throwError({
//         status: STATUS_CODES.BAD_REQUEST,
//         message: "Question not found.",
//       });
//     }

//     await FeedbackQuestions.deleteOne({ _id: questionId });
//   }

//   if (feedbackId) {
//     const feedback = await Feedbacks.findOne({ _id: feedbackId });
//     if (!feedback) {
//       throwError({
//         status: STATUS_CODES.BAD_REQUEST,
//         message: "Feedback not found.",
//       });
//     }

//     await Feedbacks.deleteOne({ _id: feedbackId });
//   }

//   if (!questionId && !feedbackId) {
//     throwError({
//       status: STATUS_CODES.BAD_REQUEST,
//       message: "At least one of questionId or feedbackId is required.",
//     });
//   }
// };

module.exports.deleteFeedbackQuestions = async (req) => {
  const { questionId } = req.body;

  if (!questionId) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "questionId is required.",
    });
  }

  const question = await FeedbackQuestions.findOne({ _id: questionId });
  if (!question) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Question not found.",
    });
  }

  await FeedbackQuestions.deleteOne({ _id: questionId });

  await Feedbacks.updateMany(
    { "answers.questionId": questionId },
    { $pull: { answers: { questionId } } }
  );
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
  const { email, contactNumber, countrTag } = req.body;

  const query = {
    status: STATUS.ACTIVE,
  };

  if (email) {
    query.email = email;
    const users = await User.find(query).lean();

    const emailExist = users.some(
      (u) => u.role === globalConstants.ROLES.STORE_OWNER
    );

    return {
      emailExist,
    };
  }

  if (contactNumber) {
    query.contactNumber = contactNumber;
    const users = await User.find(query).lean();
    const phoneExist = users.some(
      (u) => u.role === globalConstants.ROLES.STORE_OWNER
    );

    return {
      phoneExist,
    };
  }

  if (countrTag) {
    query.countrTag = countrTag;
    query.role = globalConstants.ROLES.CUSTOMER;
    const exists = await User.exists(query);
    return { countrTagExists: !!exists };
  }

  return {};
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

module.exports.createItemSearchLogs = async (req) => {
  const {
    entityId,
    body: { itemId },
  } = req;

  const existingLog = await ItemSearchLogs.findOne({ itemId });

  if (existingLog) {
    return ItemSearchLogs.updateOne(
      { _id: existingLog._id },
      { $set: { createdAt: new Date(), isRemoved: false } }
    );
  }

  return ItemSearchLogs.create({ itemId, entityId });
};

module.exports.getItemsSearchLogs = async (req) => {
  const { entityId } = req;
  const logs = await ItemSearchLogs.find({ entityId, isRemoved: false })
    .sort({ createdAt: -1 })
    .populate({
      path: "itemId",
      select: "itemName image menuCategoryId",
      model: "ItemDetails",
      populate: {
        path: "menuCategoryId",
        select: "categoryName",
        model: "CounterMenuCategory",
      },
    });

  logs.map((items) => {
    if (!items.itemId.image) {
      return items;
    }
    items.itemId.image = generatePresignedUrl(items.itemId.image);
    return items;
  });

  return logs;
};

exports.removeSearchLogs = async (req) => {
  const {
    entityId,
    body: { itemId, isRemoved },
  } = req;

  const logs = await ItemSearchLogs.findOne({
    itemId,
    entityId,
    isRemoved: false,
  });
  if (!logs) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "logs not found.",
    });
  }
  if (isRemoved) logs.isRemoved = isRemoved;

  return logs.save();
};

module.exports.restaurantCancelOrder = async (req) => {
  const { orderId } = req.body;

  const order = await Order.findOne({
    _id: orderId,
    status: { $in: [globalConstants.ORDER_STATUS.WAITING] },
  });

  if (!order) {
    throwError({
      status: STATUS_CODES.NOT_ACCEPTABLE,
      message: "Order not found",
    });
  }

  if (
    [
      globalConstants.ORDER_STATUS.IN_PROGRESS,
      globalConstants.ORDER_STATUS.READY,
      globalConstants.ORDER_STATUS.COMPLETED,
      globalConstants.ORDER_STATUS.CANCELLED,
    ].includes(order.status)
  ) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Apologies! order cannot be cancelled now.",
    });
  }

  await Order.updateOne(
    { _id: orderId },
    { $set: { status: globalConstants.ORDER_STATUS.CANCELLED } }
  );

  io.to(order.entityId.toString()).emit("cancelOrder", {
    orderId: order._id,
    status: globalConstants.ORDER_STATUS.CANCELLED,
  });
};

module.exports.getSalesReportHistory = async (req) => {
  const { userId } = req;
  const history = await SalesReport.find({ userId }).sort({
    createdAt: -1,
  });
  if (!history) return [];
  return history;
};

module.exports.downloadSalesReport = async (req, res) => {
  try {
    const { key } = req.query;

    if (!key) {
      return res.status(400).json({ message: "Key is missing" });
    }

    const fileName = path.basename(key);
    const fileBuffer = await downloadBufferFromS3(key);
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Type", "application/pdf");

    return fileBuffer;
  } catch (error) {
    console.error("Error downloading sales report:", error);
  }
};
