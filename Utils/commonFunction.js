const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { appClient } = require("../redis");
const SECRET_KEY = "BARFLY@WEBMOB456";
const Event = require("../Models/Event");
const admin = require("../firebaseAdmin");
const { STATUS } = require("./globalConstants");
const Discount = require("../Models/Discount");

const hashPassword = (password) => {
  return bcrypt.hashSync(password, 10);
};

const comparePassword = async (inputPassword, storedPassword) => {
  return bcrypt.compare(inputPassword, storedPassword);
};

const shiftArrayRight = (arr) => {
  // Check if the array is not empty
  if (arr.length === 0) return arr;

  // Remove the last element and store it
  const lastElement = arr.pop();

  // Insert the last element at the beginning of the array
  arr.unshift(lastElement);

  return arr;
};

const getJwtToken = (user, isUser = false) => {
  let payload = {
    id: user._id,
    userId: user._id,
    role: user.role,
    email: user.email,
    contactNumber: user.contactNumber,
  };
  if (!isUser) {
    payload = {
      ...payload,
      entityName: user.entityDetails.entityName,
      entityType: user.entityDetails.entityType,
      entityId: user.entityDetails._id,
    };
  }
  return jwt.sign(payload, SECRET_KEY);
};

const performEndOfDayTask = async () => {
  try {
    const today = new Date();
    today.setUTCDate(today.getUTCDate());
    const startOfDay = new Date(today);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date(today);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const pipeline = [
      {
        $match: {
          $and: [
            { from: { $gte: startOfDay } },
            { to: { $lte: endOfDay } },
            { entityId: { $exists: true } },
          ],
        },
      },
      {
        $lookup: {
          from: "entitydetails",
          localField: "entityId",
          foreignField: "_id",
          as: "entityDetails",
        },
      },
      {
        $unwind: "$entityDetails",
      },
      {
        $project: {
          _id: "$entityId",
          entityDetails: {
            _id: 1,
            city: 1,
            street: 1,
            entityName: 1,
            entityType: 1,
          },
          event: {
            _id: "$_id",
            locationName: "$locationName",
            eventName: "$eventName",
            date: "$date",
            from: "$from",
            to: "$to",
            insiders: "$insiders",
            ageLimit: "$ageLimit",
            ownerId: "$ownerId",
          },
        },
      },
    ];

    const entityDataList = await Event.aggregate(pipeline).exec();

    if (entityDataList.length) {
      await appClient
        .set("LIVE_ENTITY", JSON.stringify(entityDataList))
        .catch((error) => console.error(error));
    }
  } catch (error) {
    console.error("Error performing end of day task:", error);
  }
};

const haversineDistance = async (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

async function sendFirebaseNotification(token, title, body) {
  const message = {
    notification: { title, body },
    token: token,
  };

  try {
    const response = await admin.messaging().send(message);
    console.log("Successfully sent notification:", response);
  } catch (error) {
    console.error("Error sending notification:", error);
  }
}

const validateCoupon = async (couponCode, totalAmount) => {
  if (!couponCode) return { discountAmount: 0 };

  const discount = await Discount.findOne({
    code: couponCode,
    status: STATUS.ACTIVE,
  });
  if (!discount) {
    throw new Error("Invalid or expired coupon");
  }

  const currentDate = new Date();

  if (currentDate < discount.startDate || currentDate > discount.endDate) {
    throw new Error("Coupon is not valid at this time");
  }

  if (discount.usedCount >= discount.usageLimit) {
    throw new Error("Coupon usage limit reached");
  }

  if (totalAmount < discount.minAmount) {
    throw new Error(`Minimum order amount should be ${discount.minAmount}`);
  }

  let discountAmount = 0;

  if (discount.type === "percentage") {
    discountAmount = (totalAmount * discount.value) / 100;
    // if (discount.maxDiscount) {
    //   discountAmount = Math.min(discountAmount, discount.maxDiscount);
    // }
  } else if (discount.type === "fixed") {
    discountAmount = discount.value;
  }

  return { discountAmount, couponCode };
};

module.exports = {
  hashPassword,
  comparePassword,
  getJwtToken,
  // generateOTP,
  SECRET_KEY,
  performEndOfDayTask,
  shiftArrayRight,
  haversineDistance,
  sendFirebaseNotification,
  validateCoupon,
};
