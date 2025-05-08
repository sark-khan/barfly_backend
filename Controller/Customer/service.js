const mongoose = require("mongoose");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const Event = require("../../Models/Event");
const { Country, State, City } = require("country-state-city");

const { ObjectId } = mongoose.Types;
const {
  STATUS_CODES,
  STATUS,
  EDIT_ACTION,
  COUNTRY_ARRAY,
  ANSWER_TYPES,
} = require("../../Utils/globalConstants");
const throwError = require("../../Utils/throwError");
const EntityDetails = require("../../Models/EntityDetails");
const Counter = require("../../Models/Counter");
const MenuCategory = require("../../Models/MenuCategory");
const MenuItem = require("../../Models/MenuItem");
const FavouriteEntity = require("../../Models/FavouriteEntity");
const ItemDetails = require("../../Models/ItemDetails");
const { generatePresignedUrl } = require("../aws-service");
const User = require("../../Models/User");
const FavouriteItem = require("../../Models/FavouriteItem");
const Cards = require("../../Models/Cards");
const Otp = require("../../Models/Otp");
const { createMail, sendSMS } = require("../../Utils/mailer");
const {
  haversineDistance,
  comparePassword,
} = require("../../Utils/commonFunction");
const Location = require("./../../Models/Location");
const CountRTags = require("../../Models/CountRTags");
const Userfeedback = require("../../Models/UserFeedback");
const SearchLogs = require("../../Models/searchLogs");
const Discount = require("../../Models/Discount");
const FeedbackQuestions = require("../../Models/FeedbackQuestions");
const Tables = require("../../Models/Tables");
const notificationSettings = require("../../Models/notificationSettings");

module.exports.getEntities = async (req) => {
  const {
    limit = 30,
    skip = 0,
    searchTerm,
    isNewlyAdded,
    isPopular,
  } = req.query;
  const now = new Date();

  const favouritesList = await FavouriteEntity.find(
    { userId: req.id, isFavourite: true },
    { _id: 1, entityId: 1 },
    { lean: true }
  );

  const favouritesIdsSet = new Set();
  favouritesList.forEach((id) => {
    favouritesIdsSet.add(id.entityId.toString());
  });

  const currentRunningEvents = await Event.find(
    {
      $and: [
        { from: { $lte: now } },
        { to: { $gte: now } },
        { entityId: { $exists: true } },
      ],
    },
    { entityId: 1, counterIds: 1 }
  );

  const entityIds = currentRunningEvents.map((entity) => entity.entityId);

  const query = {
    _id: { $in: entityIds },
    isOpen: true,
    status: STATUS.ACTIVE,
  };
  const sort = {};
  if (isNewlyAdded) {
    const fortyEightHoursago = new Date();
    fortyEightHoursago.setHours(fortyEightHoursago.getHours() - 48);
    query.createdAt = { $gte: fortyEightHoursago };
  } else if (isPopular) {
    sort.views = -1;
  }

  if (searchTerm) {
    query.entityName = { $regex: searchTerm, $options: "i" }; // Case-insensitive search
  }

  const currentRunningEntitiesDetails1 = await EntityDetails.find(query, {
    city: 1,
    entityName: 1,
    entityType: 1,
    street: 1,
    image: 1,
    views: 1,
  })
    .sort(sort)
    .lean();
  const query2 = {
    _id: { $nin: entityIds },
    isOpen: true,
    status: STATUS.ACTIVE,
  };

  if (isNewlyAdded) {
    const fortyEightHoursago = new Date();
    fortyEightHoursago.setHours(fortyEightHoursago.getHours() - 48);
    query2.createdAt = { $gte: fortyEightHoursago };
  }
  // else if (isPopular) {
  //   sort.views = -1;
  // }

  currentRunningEntitiesDetails1.map((items) => {
    if (!items.image) {
      return items;
    }

    items.image = generatePresignedUrl(items.image);
    return items;
  });

  const currentRunningEntitiesDetails = currentRunningEntitiesDetails1.map(
    (entity) => {
      if (favouritesIdsSet.has(entity._id.toString())) {
        entity.isFavouriteEntity = true;
      } else {
        entity.isFavouriteEntity = false;
      }
      return entity;
    }
  );

  if (req.query?.searchTerm && req.query.searchTerm != "") {
    query2.entityName = { $regex: req.query.searchTerm, $options: "i" }; // Case-insensitive search
  }

  const remainingEntities = await EntityDetails.find(
    query2,
    {
      city: 1,
      entityName: 1,
      entityType: 1,
      street: 1,
      image: 1,
      views: 1,
    },
    { limit: limit, skip: skip, sort: sort }
  ).lean();
  remainingEntities.map((items) => {
    if (!items.image) {
      return items;
    }

    items.image = generatePresignedUrl(items.image);
    return items;
  });

  const uniqueRemainingEntities = remainingEntities.map((entity) => {
    if (favouritesIdsSet.has(entity._id.toString())) {
      entity.isFavouriteEntity = true;
    } else {
      entity.isFavouriteEntity = false;
    }
    return entity;
  });

  let currentRunningEntitiesDetailsResponse = [];
  let uniqueRemainingEntitiesResponse = [];
  if (req.query.isFavouriteEntities == "true") {
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

  return {
    ongoingEventEntities:
      req.query.isFavouriteEntities == "true"
        ? currentRunningEntitiesDetailsResponse
        : currentRunningEntitiesDetails,
    remainingEntities:
      req.query.isFavouriteEntities == "true"
        ? uniqueRemainingEntitiesResponse
        : uniqueRemainingEntities,
  };
};

// module.exports.getEntitiesList= async(req)=>{
//   const now = new Date();
//   const favouritesList = await FavouriteEntity.find(
//     { userId: req.id, isFavourite: true },
//     { _id: 1, entityId: 1 },
//     { lean: true }
//   );

//   const ongoingEvents= await Event.find({
//       $and: [
//         { from: { $lte: now } },
//         { to: { $gte: now } },
//         { entityId: { $exists: true } },
//       ],
//     },
//     { entityId: 1 }
//   );
//   const
// }

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

module.exports.eventOpened = async (req) => {
  const { eventId } = req.body;
  await Event.updateOne({ _id: eventId }, { $inc: { activeUsers: 1 } });
};

module.exports.eventClosed = async (req) => {
  const { eventId } = req.body;
  await Event.updateOne({ _id: eventId }, { $inc: { activeUsers: -1 } });
};

module.exports.getFavouriteEvents = (req) => {
  const { userId } = req;
  return FavouriteEntity.findOne({ userId }).populate("entityId");
};

module.exports.removeFavouriteEvents = async (req) => {
  const {
    userId,
    body: { eventId },
  } = req;

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
  return Event.findOneAndUpdate({ _id: eventId }, { $inc: { visitor: 1 } });
};

module.exports.counterList = async (req) => {
  const { entityId, searchTerm } = req.query;
  const query = { entityId, status: STATUS.ACTIVE };
  if (searchTerm) {
    query.counterName = { $regex: searchTerm, $options: "i" };
  }
  const counters = await Counter.find(
    query,
    { counterName: 1, totalTables: 1, isTableService: 1 },
    { sort: { _id: -1 }, lean: true }
  );
  const counterIds = counters.map((counter) => ObjectId(counter._id));

  const now = new Date();
  const eventOfThisCounters = await Event.find(
    {
      counterIds: { $in: counterIds },
      from: { $lte: now },
      to: { $gte: now },
    },
    {
      from: 1,
      to: 1,
      startingDate: 1,
      endDate: 1,
      isRepetitive: 1,
      repetitiveDays: 1,
      counterIds: 1,
    }
  ).lean();

  // const counterIdsList = new Set();
  // console.log({ eventOfThisCounters });
  // eventOfThisCounters.forEach((event) => {
  //   console.log({ event }, ">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
  //   event.counterIds.forEach((id) => counterIdsList.add(id.toString()));
  // });

  const counterLists = [];
  const counterIdsSet = new Set();

  eventOfThisCounters.forEach((event) => {
    event.counterIds.forEach((counterId) => {
      counterIdsSet.add(counterId.toString());
      counterLists.push({
        counterId: counterId.toString(),
        eventId: event._id.toString(),
      });
    });
  });

  await EntityDetails.findByIdAndUpdate(
    { _id: entityId },
    { $inc: { views: 1 } }
  );

  const counterList = counters
    .map((counter) => {
      const matchedCounter = counterLists.find(
        (c) => c.counterId == counter._id.toString()
      );

      return {
        ...counter,
        isLive: counterIdsSet.has(counter._id.toString()),
        eventId: matchedCounter ? matchedCounter.eventId : null,
      };
    })
    .sort((a, b) => b.isLive - a.isLive);

  return counterList;
};

// module.exports.counterList = async (req) => {
//   const { entityId, searchTerm } = req.query;
//   const query = { entityId, status: STATUS.ACTIVE };
//   if (searchTerm) {
//     query.counterName = { $regex: searchTerm, $options: "i" };
//   }

//   const counters = await Counter.find(
//     query,
//     { counterName: 1, totalTables: 1, isTableService: 1 },
//     { sort: { _id: -1 }, lean: true }
//   );

//   const counterIds = counters.map((counter) => ObjectId(counter._id));

//   const now = new Date();
//   const currentDay = now.getDay();
//   const currentTime = now.getTime();

//   const eventOfThisCounters = await Event.find(
//     {
//       $or: [
//         {
//           isRepetitive: false,
//           from: { $lte: now },
//           to: { $gte: now },
//         },
//         {
//           isRepetitive: true,
//           repetitiveDays: { $exists: true, $ne: [], $in: [currentDay] },
//         },
//       ],
//       counterIds: { $in: counterIds },
//     },
//     {
//       from: 1,
//       to: 1,
//       startingDate: 1,
//       endDate: 1,
//       isRepetitive: 1,
//       repetitiveDays: 1,
//       counterIds: 1,
//     }
//   ).lean();

//   const validEvents = eventOfThisCounters.filter((event) => {
//     if (!event.isRepetitive) return true;

//     const fromTime = new Date(event.from).setFullYear(
//       now.getFullYear(),
//       now.getMonth(),
//       now.getDate()
//     );
//     const toTime = new Date(event.to).setFullYear(
//       now.getFullYear(),
//       now.getMonth(),
//       now.getDate()
//     );

//     return currentTime >= fromTime && currentTime <= toTime;
//   });

//   const counterLists = [];
//   const counterIdsSet = new Set();

//   validEvents.forEach((event) => {
//     event.counterIds.forEach((counterId) => {
//       counterIdsSet.add(counterId.toString());
//       counterLists.push({
//         counterId: counterId.toString(),
//         eventId: event._id.toString(),
//       });
//     });
//   });

//   await EntityDetails.findByIdAndUpdate(
//     { _id: entityId },
//     { $inc: { views: 1 } }
//   );

//   const counterList = counters
//     .map((counter) => {
//       const matchedCounter = counterLists.find(
//         (c) => c.counterId == counter._id.toString()
//       );

//       return {
//         ...counter,
//         isLive: counterIdsSet.has(counter._id.toString()),
//         eventId: matchedCounter ? matchedCounter.eventId : null,
//       };
//     })
//     .sort((a, b) => b.isLive - a.isLive);

//   return counterList;
// };

module.exports.getCounterMenuCategory = async (req) => {
  const { counterId, searchTerm } = req.query;

  const query = { ...(counterId && { counterId }) };
  if (searchTerm) {
    query.name = { $regex: searchTerm, $options: "i" };
  }

  return await MenuCategory.find(query).lean();
};

module.exports.getMenuItems = async (req) => {
  let { menuCategoryId, searchTerm } = req.query;

  // if (mongoose.Types.ObjectId.isValid(menuCategoryId)) {
  //   menuCategoryId = new mongoose.Types.ObjectId(menuCategoryId);
  // }

  let filter = { menuCategoryId, inStock: true };

  if (searchTerm && searchTerm.trim()) {
    filter.itemName = { $regex: searchTerm, $options: "i" };
  }

  const menuItems = await ItemDetails.find(filter)
    .populate("menuCategoryId")
    .lean();
  if (!menuItems.length) {
    return [];
  }

  // console.log({menuItems: menuItems[0].menuCategoryId.categoryName});
  // // const name = await MenuCategory.findOne(
  // //   { _id: menuCategoryId },
  // //   { name: 1, _id: 0 }
  // // ).lean();

  const favouriteItemList = await FavouriteItem.find(
    {
      userId: req.userId,
      counterId: menuItems[0].counterId,
      isFavourite: true,
    },
    { favouriteItemId: 1 }
  );
  let favouriteItemIds = new Set();
  favouriteItemList.forEach((item) => {
    favouriteItemIds.add(item.favouriteItemId.toString());
  });

  const menuItemsResp = menuItems.reduce((acc, menuItem) => {
    let itemDetails = menuItem.item;
    menuItem.image = generatePresignedUrl(menuItem.image);
    delete menuItem.item;
    if (favouriteItemIds.has(menuItem._id.toString())) {
      menuItem.isFavourite = true;
    } else {
      menuItem.isFavourite = false;
    }
    // itemDetails.image = generatePresignedUrl(itemDetails?.image);
    delete menuItem.itemId;
    acc.push({
      ...menuItem,
      ...itemDetails,
    });
    return acc;
  }, []);
  return menuItemsResp;
};

// module.exports.getRecommendedItems = async (req) => {
//   const { entityId, counterId, searchTerm } = req.query;

//   const query = { entityId, counterIds: counterId };

//   if (searchTerm) {
//     query.itemName = { $regex: searchTerm, $options: "i" };
//   }

//   const allItems = await ItemDetails.find(query).populate("menuCategoryId");

//   const categoryMap = {};

//   allItems.forEach((item) => {
//     item.image = generatePresignedUrl(item.image);
//     if (!categoryMap[item.menuCategoryId]) {
//       categoryMap[item.menuCategoryId] = item;
//     }
//   });

//   return Object.values(categoryMap);
// };

module.exports.getRecommendedItems = async (req) => {
  const { entityId, counterId, searchTerm } = req.query;

  const query = { entityId, counterIds: counterId };

  if (searchTerm) {
    query.itemName = { $regex: searchTerm, $options: "i" };
  }

  const allItems = await ItemDetails.find(query)
    .populate("menuCategoryId")
    .lean();

  const counterItemMap = {};

  allItems.forEach((item) => {
    if (item.menuCategoryId.counterId == counterId) {
      item.image = generatePresignedUrl(item.image);
      const counterKey = `${item.counterId}_${item.itemName}`;

      if (!counterItemMap[counterKey]) {
        counterItemMap[counterKey] = item;
      }
    }
  });

  return Object.values(counterItemMap).slice(0, 2);
};

module.exports.addExistingItemToMenu = async (req) => {
  const { menuId, itemId } = req.body;
  const itemDetails = await MenuItem.findById(itemId).lean();
  const menuCategory = await MenuCategory.findById(menuId).lean();
  const updateSet = {
    entityId: req.entityId,
    counterId: menuId,
    itemId: itemId,
    price: itemDetails.price,
    availableQuantity: itemDetails.availableQuantity ?? 10000000000,
    currency: itemDetails.currency,
    menuCategoryId: menuCategory._id,
  };
  await ItemDetails.updateOne(
    { _id: itemId },
    { $set: updateSet },
    { upsert: true }
  ).lean();
};

module.exports.updateLanguage = async (req) => {
  const { selectedLanguage } = req.body;
  await User.updateOne(
    { id: req.id },
    { $set: { language: selectedLanguage } },
    { upsert: true }
  );
};

module.exports.updateFavouriteItem = async (req) => {
  const userId = req.userId;
  const { menuId, itemId, isFavourite } = req.body;
  const menuCategory = await MenuCategory.findById(menuId, { counterId: 1 });
  if (!menuCategory) {
    throwError({
      status: STATUS_CODES.NOT_FOUND,
      message: "No such menu Exists",
    });
  }
  await FavouriteItem.updateOne(
    { userId, favouriteItemId: itemId, counterId: menuCategory.counterId },
    {
      $set: {
        isFavourite,
      },
    },
    { upsert: true }
  );
  return;
};

module.exports.getFavouriteItems = async (req) => {
  const { counterId } = req.query;
  const favouriteItemList = await FavouriteItem.find(
    {
      userId: req.userId,
      counterId: counterId,
      isFavourite: true,
    },
    { favouriteItemId: 1 }
  );

  const searchTerm = req.query.searchTerm?.trim(); // The search term for itemName

  // Fetch the list of favourite item IDs
  const favouriteItemIds = favouriteItemList.map(
    (item) => item.favouriteItemId
  );

  const menuItems = await ItemDetails.aggregate([
    // Match documents in `ItemDetails` based on `counterId`
    {
      $match: {
        counterId: ObjectId(counterId), // Ensure `counterId` is an ObjectId
      },
    },
    // Populate `itemId` from `MenuItem` collection
    {
      $lookup: {
        from: "menuitems", // Collection name for `MenuItem`
        localField: "itemId",
        foreignField: "_id",
        as: "item", // Name for the populated field
      },
    },
    // Unwind the `item` array to treat it as a single object
    {
      $unwind: "$item",
    },
    // Match items that are in the `favouriteItemList`
    {
      $match: {
        "item._id": { $in: favouriteItemIds },
      },
    },
    // Apply regex search for `item.itemName` if `searchTerm` is provided
    ...(searchTerm
      ? [
          {
            $match: {
              "item.itemName": { $regex: searchTerm, $options: "i" }, // Case-insensitive search
            },
          },
        ]
      : []),
    // Project only the necessary fields
    {
      $project: {
        "item._id": 1,
        "item.itemName": 1,
        "item.description": 1,
        "item.type": 1,
        "item.price": 1,
        "item.currency": 1,
        "item.image": 1,
        "item.quantity": 1,
        price: 1, // Price from `ItemDetails`
        availableQuantity: 1,
        counterId: 1,
        entityId: 1,
        createdAt: 1,
        updatedAt: 1,
        currency: 1,
      },
    },
    // Sort the results by `updatedAt`
    {
      $sort: { updatedAt: -1 },
    },
  ]);

  const menuItemsResp = menuItems.reduce((acc, menuItem) => {
    const itemDetails = menuItem.item;
    delete menuItem.item;
    itemDetails.image = generatePresignedUrl(itemDetails.image);
    delete menuItem.itemId;
    acc.push({
      ...menuItem,
      isFavourite: true,
      ...itemDetails,
    });
    return acc;
  }, []);
  return menuItemsResp;
};

module.exports.addCards = async (req) => {
  const {
    userId,
    body: { cardHolderName, cardNo, cardExpireAt, securityCode, type },
  } = req;

  const user = await User.findById(userId);
  if (!user) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "User doesn't exist.",
    });
  }

  const cardObj = {
    cardHolderName,
    cardNo,
    cardExpireAt,
    securityCode,
    type,
    status: STATUS.ACTIVE,
    userId: user._id,
  };
  await Cards.create(cardObj);
};

module.exports.getUserCards = async (req) => {
  const { userId } = req;
  const cardDetails = await Cards.find({
    userId,
    status: STATUS.ACTIVE,
  }).lean();
  return cardDetails;
};

module.exports.editOrDeleteCards = async (req) => {
  const {
    userId,
    body: {
      cardId,
      cardHolderName,
      cardNo,
      cardExpireAt,
      securityCode,
      action,
    },
  } = req;

  let message = "";

  const cardDetails = await Cards.findOne({
    userId,
    _id: cardId,
    status: STATUS.ACTIVE,
  });

  if (!cardDetails) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Card not found.",
    });
  }

  if (action === EDIT_ACTION.EDIT) {
    if (cardHolderName) cardDetails.cardHolderName = cardHolderName;
    if (cardNo) cardDetails.cardNo = cardNo;
    if (cardExpireAt) cardDetails.cardExpireAt = cardExpireAt;
    if (securityCode) cardDetails.securityCode = securityCode;
    message = "Card details updated successfully.";
  }

  if (action === EDIT_ACTION.DELETE) {
    cardDetails.status = STATUS.DELETED;
    message = "Card deleted successfully.";
  }
  await cardDetails.save();

  return message;
};

module.exports.getUserDetails = async (req) => {
  const { userId } = req;
  const userDetails = await User.findOne({
    _id: userId,
    status: STATUS.ACTIVE,
  });
  // const couterTag = await CountRTags.findOne(
  //   { userId },
  //   { countRTag: 1, _id: 0 }
  // );
  if (!userDetails) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "User doesn't exist.",
    });
  }

  return {
    ...userDetails.toObject(),
    // countRTag: couterTag ? couterTag.countRTag : "",
  };
};

module.exports.updateUserDetails = async (req) => {
  const {
    userId,
    body: { email, contactNumber, newPassword, enteredOtp },
  } = req;
  console.log({ body: req.body });

  let message = "";

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
    return message;
  }

  const query = { status: STATUS.ACTIVE };
  if (email) {
    query.email = email;
  }
  if (contactNumber) {
    query.contactNumber = contactNumber;
  }

  const user = await User.findOne(query);
  if (user) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: email
        ? `Email ${email} already exists.`
        : `Contact number ${contactNumber} already exists.`,
    });
  }

  if (email) {
    if (!enteredOtp) {
      const otp = crypto.randomInt(100000, 999999).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // OTP valid for 5 minutes

      await Otp.findOneAndUpdate(
        { email },
        { otp, userId, expiresAt },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      console.log({ otp });

      const mail_data = {
        to: email,
        subject: "COUNTR: OTP for Email Update",
        text: `Please use the below OTP to verify your identity for updating your email on Countr: \n\n ${otp} \n\n (Valid for 5 minutes)`,
      };

      createMail(mail_data);
      await User.updateOne({ _id: userId }, { emailOtpVerified: false });

      return (message = "OTP sent to your new email.");
    } else {
      const otpRecord = await Otp.findOne({ email });
      if (
        !otpRecord ||
        otpRecord.otp !== enteredOtp ||
        new Date() > otpRecord.expiresAt
      ) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: "Invalid OTP or OTP expired.",
        });
      }
      // if (
      //   !otpRecord ||
      //   otpRecord.otp.toString() !== enteredOtp ||
      //   new Date() > otpRecord.expiresAt
      // ) {
      //   throwError({
      //     status: STATUS_CODES.BAD_REQUEST,
      //     message: "Invalid OTP or OTP expired.",
      //   });
      // }

      await Otp.deleteOne({ email });

      await User.updateOne({ _id: userId }, { email, emailOtpVerified: true });

      message = "Email updated successfully.";
      return { message };
    }
  }

  if (contactNumber) {
    if (!enteredOtp) {
      const otp = crypto.randomInt(100000, 999999).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      await Otp.findOneAndUpdate(
        { contactNumber },
        { otp, userId, expiresAt },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const msg = `Your verification code is: ${otp}`;
      await sendSMS({ toPhoneNumber: contactNumber, message: msg });

      await User.updateOne({ _id: userId }, { phoneOtpVerified: false });

      return { message: "OTP sent to your new mobile number." };
    } else {
      const otpRecord = await Otp.findOne({ contactNumber });
      if (
        !otpRecord ||
        otpRecord.otp !== enteredOtp ||
        new Date() > otpRecord.expiresAt
      ) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: "Invalid OTP or OTP expired.",
        });
      }

      await Otp.deleteOne({ contactNumber });

      await User.updateOne(
        { _id: userId },
        { contactNumber, phoneOtpVerified: true }
      );

      message = "Mobile number updated successfully.";
      return { message };
    }
  }
};

module.exports.processLocationForUser = async (req) => {
  const { userId, latitude, longitude, locationEnabled } = req.body;
  const insideArea =
    latitude >= 10 && latitude <= 20 && longitude >= 30 && longitude <= 40;

  const referencePoint = { lat: 30.642803, lon: 76.816902 };
  const distance = await haversineDistance(
    latitude,
    longitude,
    referencePoint.lat,
    referencePoint.lon
  );
  console.log({ distance });

  const user = await User.findById(userId);
  if (!user) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "User not found.",
    });
  }
  if (locationEnabled) {
    await User.updateOne({ _id: userId }, { $set: { locationEnabled: true } });
  }
  let locationSaved = false;
  if (user.locationEnabled) {
    await Location.create({
      userId: user._id,
      latitude,
      longitude,
    });
    locationSaved = true;
  }

  return {
    insideArea,
    distanceInKm: distance,
    locationSaved,
  };
};

module.exports.userFeedback = async (req) => {
  const {
    userId,
    body: { entityId, answers },
  } = req;

  const user = await User.findById(userId);
  if (!user) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "User doesn't exist.",
    });
  }

  const entity = await EntityDetails.findById(entityId);
  if (!entity) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Entity doesn't exist.",
    });
  }

  if (!Array.isArray(answers) || answers.length === 0) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Feedback answers are required.",
    });
  }

  for (const answer of answers) {
    if (!answer.questionId || answer.value === undefined) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "Each answer must have questionId and value.",
      });
    }
  }

  const feedbackObj = {
    userId,
    entityId: entity._id,
    answers,
  };

  return Userfeedback.create(feedbackObj);
};

exports.getAllcountries = () => {
  const data = COUNTRY_ARRAY;
  return { data };
};

exports.getCountryByIsoCode = ({ req }) => {
  const { isoCode } = req.query;
  const countries = Country.getAllCountries();
  const country = countries.find((country) => country.isoCode === isoCode);
  if (!country) {
    throw new Error(`Country with ISO code ${isoCode} not found.`);
  }
  const states = State.getStatesOfCountry(isoCode);
  const data = {
    country: country.name,
    isoCode: country.isoCode,
    statesList: states.map((state) => ({
      state: state.name,
      isoCode: state.isoCode,
    })),
  };
  return { data };
};

exports.getCitiesOfStates = async (req) => {
  const { countryCode, stateCode } = req.query;
  const cities = City.getCitiesOfState(countryCode, stateCode);
  return cities;
};

exports.createSearchLogs = async (req) => {
  const {
    userId,
    body: { entityId },
  } = req;

  const existingLog = await SearchLogs.findOne({ userId, entityId });

  if (existingLog) {
    return SearchLogs.updateOne(
      { _id: existingLog._id },
      { $set: { createdAt: new Date(), isRemoved: false } }
    );
  }

  return SearchLogs.create({ userId, entityId });
};

exports.getSearchLogs = async (req) => {
  const { userId } = req;
  const logs = await SearchLogs.find({ userId, isRemoved: false })
    .sort({ createdAt: -1 })
    .populate({
      path: "entityId",
      select: "entityName city state country image",
      model: "EntityDetails",
    });
  logs.map((items) => {
    if (!items.entityId.image) {
      return items;
    }

    items.entityId.image = generatePresignedUrl(items.entityId.image);
    return items;
  });

  return logs;
};

exports.removeLogs = async (req) => {
  const {
    userId,
    body: { entityId, isRemoved },
  } = req;

  const logs = await SearchLogs.findOne({ userId, entityId, isRemoved: false });
  if (!logs) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "logs not found.",
    });
  }
  if (isRemoved) logs.isRemoved = isRemoved;

  return logs.save();
};

exports.newlyAddedEntities = async () => {
  const fortyEightHoursago = new Date();
  fortyEightHoursago.setHours(fortyEightHoursago.getHours() - 48);

  const entities = await EntityDetails.find({
    createdAt: { $gte: fortyEightHoursago },
  }).sort({ createdAt: -1 });

  entities.map((entity) => {
    entity.image = generatePresignedUrl(entity.image);
    return entity;
  });
  return entities;
};

exports.popularEntities = async () => {
  const popular = await EntityDetails.find(
    {},
    { entityName: 1, city: 1, views: 1, country: 1, status: 1, image: 1 }
  )
    .sort({ views: -1 })
    .limit(10);

  popular.map((entity) => {
    if (entity.image != null) {
      entity.image = generatePresignedUrl(entity.image);
    }
    return entity;
  });
  return popular;
};

module.exports.entityOffers = async () => {
  const projection = {
    code: 1,
    type: 1,
    value: 1,
    description: 1,
    entityId: 1,
    colourTheme: 1,
  };
  const coupons = await Discount.find({}, projection).populate({
    path: "entityId",
    select: "entityName image city country status",
    model: "EntityDetails",
  });

  coupons.forEach((coupon) => {
    if (coupon.entityId?.status === STATUS.ACTIVE) {
      coupon.entityId.image = generatePresignedUrl(coupon.entityId.image);
    }
  });

  return coupons;
};

module.exports.getFeedbackQuestions = async (req) => {
  const entityId = req.query?.entityId || req.entityId;

  const feedbackQuestions = await FeedbackQuestions.find({ entityId }).lean();
  if (!feedbackQuestions || feedbackQuestions.length === 0) return [];

  const questionsWithAnswerTypeKey = feedbackQuestions.map((question) => {
    let answerTypeKey = null;

    for (const [key, values] of Object.entries(ANSWER_TYPES)) {
      if (
        Array.isArray(question.answerType) &&
        question.answerType.length === values.length &&
        question.answerType.every((val) => values.includes(val))
      ) {
        answerTypeKey = key;
        break;
      }
    }

    return {
      ...question,
      answerTypeKey,
    };
  });

  return questionsWithAnswerTypeKey;
};

module.exports.getTablesUserSide = async (req) => {
  const { entityId, counterId } = req.query;
  const query = { entityId, counterIds: counterId };

  const tables = await Tables.findOne(query, {
    tableCount: 1,
    counterIds: 1,
    entityId: 1,
  })
    .populate({
      path: "counterIds",
      model: "Counter",
    })
    .lean();

  if (!tables) {
    return [];
  }
  // console.log("reache dehr ehr vef[ier");
  // if (tables.isTableService) {
  //   console.log("eache dher er");
  //   return tables;
  // }

  console.log({ tables });
  const tablesRes = [];
  tables.counterIds.forEach((counter) => {
    if (counter._id == counterId && counter.isTableService == true) {
      tablesRes.push(tables);
    }
    // return false;
  });

  return tablesRes;
};

module.exports.fetchNotificationSettings = async (req) => {
  return notificationSettings.findOne({ userId: req.userId });
};

module.exports.updateNotificationSettings = async (req) => {
  const { isEmailOn, isPushOn, isPromotionalOn, value } = req.body;
  let updatedValue = {};
  if (isEmailOn == true) {
    updatedValue = {
      isEmailOn: value,
    };
  } else if (isPushOn == true) {
    updatedValue = {
      isPushOn: value,
    };
  } else if (isPromotionalOn) {
    updatedValue = {
      isPromotionalOn: value,
    };
  }

  await notificationSettings.updateOne(
    { userId: req.userId },
    { $set: updatedValue },
    { upsert: true }
  );
  return;
};
