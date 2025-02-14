const mongoose = require("mongoose");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const Event = require("../../Models/Event");
const { ObjectId } = mongoose.Types;
const {
  STATUS_CODES,
  STATUS,
  EDIT_ACTION,
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

module.exports.getEntities = async (req) => {
  const { limit = 30, skip = 0, searchTerm } = req.query;
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
  // console.log({currentRunningEvents});

  const entityIds = currentRunningEvents.map((entity) => entity.entityId);
  const query = {
    _id: { $in: entityIds },
  };

  if (searchTerm) {
    query.entityName = { $regex: searchTerm, $options: "i" }; // Case-insensitive search
  }

  const currentRunningEntitiesDetails1 = await EntityDetails.find(query, {
    city: 1,
    entityName: 1,
    entityType: 1,
    street: 1,
    image: 1,
  }).lean();
  const query2 = {
    _id: { $nin: entityIds },
  };

  currentRunningEntitiesDetails1.map((items) => {
    console.log("Image key before generating URL:", items.image);

    if (!items.image) {
      console.warn("Skipping entity because image is missing:", items);
      return items; // Ensure we don't modify the object if image is invalid
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

  if (req.query?.searchTerm && req.query.seacrhTerm != "") {
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
    },
    { limit: limit, skip: skip }
  ).lean();
  console.log({ remainingEntities });
  remainingEntities.map((items) => {
    console.log("Image key before generating URL:", items.image);

    if (!items.image) {
      console.warn("Skipping entity because image is missing:", items);
      return items; // Ensure we don't modify the object if image is invalid
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
    // currentRunningEntitiesDetailsImage,
    remainingEntities:
      req.query.isFavouriteEntities == "true"
        ? uniqueRemainingEntitiesResponse
        : uniqueRemainingEntities,
    // remainingEntitiesImage,
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
  console.log({ entityId, isFavourite });

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
  const query = { entityId };
  if (searchTerm) {
    query.counterName = { $regex: searchTerm, $options: "i" }; // Case-insensitive search
  }
  const counters = await Counter.find(
    query,
    { counterName: 1 },
    { sort: { _id: -1 }, lean: true }
  );
  const counterIds = counters.map((counter) => ObjectId(counter._id));

  const now = new Date();
  const eventOfThisCounters = await Event.find(
    {
      counterIds: { $in: counterIds }, // Match events with counterIds in the given array
      from: { $lte: now }, // `from` date should be less than or equal to `now`
      to: { $gte: now }, // `to` date should be greater than or equal to `now`
    },
    {
      from: 1, // Include these fields in the result
      to: 1,
      startingDate: 1,
      endDate: 1,
      isRepetitive: 1,
      repetitiveDays: 1,
      counterIds: 1,
    }
  ).lean();

  const counterIdsList = new Set();
  eventOfThisCounters.forEach((event) => {
    event.counterIds.forEach((id) => counterIdsList.add(id.toString()));
  });

  const counterList = counters.map((counter) => {
    if (counterIdsList.has(counter._id.toString())) {
      counter.isLive = true;
      return counter;
    }
    counter.isLive = false;
    return counter;
  });

  return counterList;
};

module.exports.getMenuSubCategory = async (req) => {
  const { counterId, searchTerm } = req.query;

  const query = { ...(counterId && { counterId }) };
  if (searchTerm) {
    query.name = { $regex: searchTerm, $options: "i" };
  }

  // Fetch subcategories with lean() for performance optimization
  return await MenuCategory.find(query).lean();
};

module.exports.getMenuItems = async (req) => {
  const { menuCategoryId } = req.query;
  const searchTerm = req.query.searchTerm?.trim(); // The search term for itemName

  const menuItems = await ItemDetails.aggregate([
    {
      $match: {
        menuCategoryId: ObjectId(menuCategoryId), // Ensure `menuCategoryId` is an ObjectId
      },
    },
    {
      $lookup: {
        from: "menuitems",
        localField: "itemId",
        foreignField: "_id",
        as: "item",
      },
    },
    {
      $unwind: "$item",
    },
    ...(searchTerm
      ? [
          {
            $match: {
              "item.itemName": { $regex: searchTerm, $options: "i" }, // Case-insensitive search
            },
          },
        ]
      : []),
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
        price: 1,
        availableQuantity: 1,
        menuCategoryId: 1,
        counterId: 1,
        entityId: 1,
        createdAt: 1,
        updatedAt: 1,
        currency: 1,
      },
    },
    {
      $sort: { updatedAt: -1 },
    },
  ]);
  if (!menuItems.length) {
    return [];
  }
  const name = await MenuCategory.findOne(
    { _id: menuCategoryId },
    { name: 1, _id: 0 }
  ).lean();

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
  console.log({ favouriteItemList });

  const menuItemsResp = menuItems.reduce((acc, menuItem) => {
    const itemDetails = menuItem.item;
    delete menuItem.item;
    if (favouriteItemIds.has(menuItem._id.toString())) {
      menuItem.isFavourite = true;
    } else {
      menuItem.isFavourite = false;
    }
    itemDetails.image = generatePresignedUrl(itemDetails.image);
    delete menuItem.itemId;
    acc.push({
      ...menuItem,
      ...itemDetails,
    });
    return acc;
  }, []);
  return { menuItemsResp, ...name };
};

module.exports.addExistingItemToMenu = async (req) => {
  const { menuId, itemId } = req.body;
  const itemDetails = await MenuItem.findById(itemId).lean();
  const menuCategory = await MenuCategory.findById(menuId).lean();
  console.log({ menuCategory, itemDetails });
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
  const userId = req.id;
  const { menuId, itemId, isFavourite } = req.body;
  console.log({ isFavourite });
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
      userId: req.id,
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
  console.log({ favouriteItemIds });

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

  console.log({ menuItems });

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
  console.log({ menuItemsResp });
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
  const couterTag = await CountRTags.findOne(
    { userId },
    { countRTag: 1, _id: 0 }
  );
  if (!userDetails) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "User doesn't exist.",
    });
  }

  return {
    ...userDetails.toObject(),
    countRTag: couterTag ? couterTag.countRTag : "",
  };
};

module.exports.updateUserDetails = async (req) => {
  const {
    userId,
    body: { email, contactNumber, newPassword, enteredOtp },
  } = req;

  let message = "";

  const user = await User.findOne({ _id: userId, status: STATUS.ACTIVE });
  console.log({ user });
  if (!user) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "User doesn't exist.",
    });
  }

  if (email) {
    if (user.email == email) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message:
          "You are not allowed to enter the same email. Please try again.",
      });
    }
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
    } else if (enteredOtp && !user.emailOtpVerified) {
      const otpRecord = await Otp.findOne({ email });
      console.log({ otpRecord });
      if (!otpRecord) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: "Invalid OTP or OTP expired.",
        });
      }

      const { otp, expiresAt } = otpRecord;
      if (otp !== enteredOtp) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: "Incorrect OTP.",
        });
      }

      if (new Date() > expiresAt) {
        await Otp.deleteOne({ email });
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: "OTP expired. Request a new one.",
        });
      }

      await Otp.deleteOne({ email });

      user.emailOtpVerified = true;
      await user.save();

      user.email = email;
      await user.save();

      user.emailOtpVerified = false;
      await user.save();

      message = "Email updated successfully.";
      return { message, user };
    }
  }

  if (contactNumber) {
    if (user.contactNumber == contactNumber) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message:
          "You are not allowed to enter the same mobile number. Please try again.",
      });
    }
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

      message = "OTP sent to your new mobile Number.";
    } else if (enteredOtp && !user.phoneOtpVerified) {
      const otpRecord = await Otp.findOne({ contactNumber });
      if (!otpRecord) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: "Invalid OTP or OTP expired.",
        });
      }

      const { otp, expiresAt } = otpRecord;
      if (otp !== enteredOtp) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: "Incorrect OTP.",
        });
      }

      if (new Date() > expiresAt) {
        await Otp.deleteOne({ contactNumber });
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: "OTP expired. Request a new one.",
        });
      }

      await Otp.deleteOne({ contactNumber });

      user.phoneOtpVerified = true;
      await user.save();

      user.contactNumber = contactNumber;
      await user.save();

      user.phoneOtpVerified = false;
      await user.save();

      message = "Mobile number updated successfully.";
      return { message, user };
    }
  }
  if (newPassword) {
    const passwordCompare = await comparePassword(newPassword, user.password);
    if (passwordCompare) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "We don't accept old password as new password.",
      });
    }
    const passwordChange = bcrypt.hashSync(newPassword, 10);
    user.password = passwordChange;
    await user.save();
    message = "Password updated successfuly.";
    return { message };
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
    body: {
      entityId,
      counterId,
      experience,
      experienceDescription,
      placingOrderProcess,
      placingOrderProcessDescription,
      statusUpdation,
      statusUpdationDescription,
    },
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

  const counter = await Counter.findById(counterId);
  if (!counter) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Counter not found.",
    });
  }

  const feedbackObj = {
    userId,
    entityId: entity._id,
    counterId: counter._id,
    experience: {
      value: experience,
      description: experienceDescription || "",
    },
    placingOrderProcess: {
      value: placingOrderProcess,
      description: placingOrderProcessDescription || "",
    },
    statusUpdation: {
      value: statusUpdation,
      description: statusUpdationDescription || "",
    },
  };

  await Userfeedback.create(feedbackObj);

  return feedbackObj;
};
