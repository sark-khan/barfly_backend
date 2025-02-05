const mongoose = require("mongoose");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const Event = require("../../Models/Event");
// const UserFavourites = require("../../Models/UserFavourites");
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
const { createMail } = require("../../Utils/mailer");

module.exports.getEntities = async (req) => {
  const { limit = 30, skip = 0 } = req.query;
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
    },
    { limit: limit, skip: skip }
  ).lean();

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

module.exports.eventClsoed = async (req) => {
  const { eventId } = req.body;
  await Event.updateOne({ _id: eventId }, { $inc: { activeUsers: -1 } });
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
  const query = { entityId };
  if (req.query?.searchTerm && req.query.seacrhTerm != "") {
    query.counterName = { $regex: req.query.searchTerm, $options: "i" }; // Case-insensitive search
  }
  const counters = await Counter.find(
    query,
    { counterName: 1 },
    { sort: { _id: -1 }, lean: true }
  );
  const counterIds = counters.map((counter) =>
    mongoose.Types.ObjectId(counter._id)
  );

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
  const { counterId } = req.query;
  const query = { counterId };
  if (req.query?.searchTerm && req.query.seacrhTerm != "") {
    query.name = { $regex: req.query.searchTerm, $options: "i" }; // Case-insensitive search
  }
  const counterSubCategory = await MenuCategory.find(query);

  return counterSubCategory;
};

module.exports.getMenuItems = async (req) => {
  const { menuCategoryId } = req.query;
  // const menuCategoryId = req.query.menuCategoryId; // The menu category ID passed in the request
  const searchTerm = req.query.searchTerm?.trim(); // The search term for itemName

  const menuItems = await ItemDetails.aggregate([
    // Match documents in `ItemDetails` based on `menuCategoryId`
    {
      $match: {
        menuCategoryId: mongoose.Types.ObjectId(menuCategoryId), // Ensure `menuCategoryId` is an ObjectId
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
        menuCategoryId: 1,
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
  // console.log({ menuItems });
  if (!menuItems.length) {
    return [];
  }
  console.log({ mj: menuItems[0], id: req.id });
  const favouriteItemList = await FavouriteItem.find(
    {
      userId: req.id,
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
  // console.log({ menuItemsResp });
  return menuItemsResp;
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
        counterId: mongoose.Types.ObjectId(counterId), // Ensure `counterId` is an ObjectId
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
  const cardDetails = await Cards.find({ userId, status: STATUS.ACTIVE });
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

  const cardDetails = await Cards.findOne({ userId, cardNo: cardNo });

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

    await cardDetails.save();
    message = "Card details updated successfully.";
  }

  if (action === EDIT_ACTION.DELETE) {
    cardDetails.status = STATUS.DELETED;
    await cardDetails.save();
    message = "Card deleted successfully.";
  }

  return message;
};

module.exports.getUserDetails = async (req) => {
  const { userId } = req;
  const userDetails = await User.findOne({ _id: userId });
  if (!userDetails) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "User doesn't exist.",
    });
  }
  return userDetails;
};

module.exports.updateUserDetails = async (req) => {
  const {
    userId,
    body: {
      email,
      newEmail,
      contactNumber,
      newContactNumber,
      newPassword,
      enteredOtp,
    },
  } = req;

  let message = "";

  const user = await User.findOne({ _id: userId });
  if (!user) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "User doesn't exist.",
    });
  }

  if (email) {
    if (!enteredOtp && !newEmail) {
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

      message = "OTP sent to your current email.";
    } else if (enteredOtp && !user.emailOtpVerified) {
      const otpRecord = await Otp.findOne({ email });

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

      await User.updateOne({ _id: userId }, { emailOtpVerified: true });

      message = "OTP verified successfully. You can now enter your new email.";
    }
  }
  if (contactNumber) {
    if (!enteredOtp && !newContactNumber) {
      const otp = crypto.randomInt(100000, 999999).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // OTP valid for 5 minutes

      await Otp.findOneAndUpdate(
        { contactNumber },
        { otp, userId, expiresAt },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      console.log({ otp });

      // const mail_data = {
      //   to: contactNumber,
      //   subject: "COUNTR: OTP for Email Update",
      //   text: `Please use the below OTP to verify your identity for updating your email on Countr: \n\n ${otp} \n\n (Valid for 5 minutes)`,
      // };

      // createMail(mail_data);

      // Mark that OTP is sent but not yet verified
      await User.updateOne({ _id: userId }, { phoneOtpVerified: false });

      message = "OTP sent to your current email.";
    } else if (enteredOtp && !user.phoneOtpVerified) {
      const otpRecord = await Otp.findOne({ email });

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

      await User.updateOne({ _id: userId }, { phoneOtpVerified: true });

      message =
        "OTP verified successfully. You can now enter your new mobile number.";
    }
  }
  if (newPassword) {
    const passwordChange = bcrypt.hashSync(newPassword, 10);
    user.password = passwordChange;
    await user.save();
  }

  if (newEmail || newContactNumber) {
    const otpVerifiedField = newEmail ? "emailOtpVerified" : "phoneOtpVerified";
    const newValue = newEmail || newContactNumber;
    const fieldToUpdate = newEmail ? "email" : "contactNumber";

    if (!user[otpVerifiedField]) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: `OTP verification required before updating the ${
          newEmail ? "email" : "mobile number"
        }.`,
      });
    }

    user[fieldToUpdate] = newValue;
    user[otpVerifiedField] = false; // Reset after update
    message = `${newEmail ? "Email" : "Mobile number"} updated successfully.`;

    await user.save();
  }

  return message;
};
