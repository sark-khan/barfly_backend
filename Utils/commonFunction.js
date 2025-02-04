const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { appClient } = require("../redis");
const SECRET_KEY = "BARFLY@WEBMOB456";
const Event = require("../Models/Event");

const hashPassword = (password) => {
  return bcrypt.hashSync(password, 8);
};

function generateOTP(length) {
  // Define the characters to be used in the OTP
  const characters =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let otp = "";

  // Generate a random OTP of the specified length
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    otp += characters[randomIndex];
  }

  return otp;
}

const comparePassword = async (inputPassword, storedPassword) => {
  return bcrypt.compare(inputPassword, storedPassword);
};

const  shiftArrayRight=(arr)=>{
  // Check if the array is not empty
  if (arr.length === 0) return arr;

  // Remove the last element and store it
  const lastElement = arr.pop();

  // Insert the last element at the beginning of the array
  arr.unshift(lastElement);

  return arr;
}

const getJwtToken = (user, isUser = false) => {
  let payload = {
    id: user._id,
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
    }
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

module.exports = {
  hashPassword,
  comparePassword,
  getJwtToken,
  generateOTP,
  SECRET_KEY,
  performEndOfDayTask,
  shiftArrayRight
};
