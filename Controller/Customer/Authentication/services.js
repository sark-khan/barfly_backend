const {
  STATUS_CODES,
  ROLES,
  KEY_TYPE_PREFIXES,
  STATUS,
} = require("../../../Utils/globalConstants");
const {
  hashPassword,
  comparePassword,
  getJwtToken,
  generateOTP,
} = require("../../../Utils/commonFunction");
const throwError = require("../../../Utils/throwError");
const Otp = require("../../../Models/Otp");
const { createMail } = require("../../../Utils/mailer");
const User = require("../../../Models/User");
const CountRTags = require("../../../Models/CountRTags");
const redisClient = require("./../../../redis");

module.exports.register = async (req) => {
  const {
    email,
    fullName,
    city,
    street,
    zipcode,
    password,
    dob,
    country,
    address,
    contactNumber,
  } = req.body;

  const userExist = await User.findOne({ email, status: STATUS.ACTIVE }).lean();
  if (userExist) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "User already registerd",
    });
  }

  const hashedPassword = hashPassword(password);
  const userObj = await User.create({
    role: ROLES.CUSTOMER,
    fullName,
    email,
    password: hashedPassword,
    city,
    street,
    zipcode,
    dob,
    country,
    address,
    contactNumber,
    status: STATUS.ACTIVE,
  });

  delete userObj.password;

  const token = getJwtToken(userObj, true);
  return { userObj, token };
};

module.exports.login = async (req) => {
  const { email, password } = req.body;
  const userProjection = {
    role: 1,
    firstName: 1,
    lastName: 1,
    email: 1,
    password: 1,
    contactNumber: 1,
  };

  const user = await User.findOne(
    { email, status: STATUS.ACTIVE },
    userProjection
  ).lean();

  if (!user) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: "User does not exist",
    });
  }

  if (user.role !== ROLES.CUSTOMER) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: "Only Customers can log in",
    });
  }

  const isPasswordValid = await comparePassword(password, user.password);
  if (!isPasswordValid) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: "Invalid password",
    });
  }

  // const token = getJwtToken(user, true);
  // delete user.password;

  // return { user, token };
};

module.exports.countRTag = async (req) => {
  const { countRTag, userId } = req.body;

  const user = await User.findById(userId);
  if (!user) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "User doesn't exist",
    });
  }

  const countRTagExists = await CountRTags.findOne({ countRTag }).lean();
  if (countRTagExists) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Oops! This username is not available. Please try again.",
    });
  }

  const obj = {
    userId: user._id,
    countRTag: `${countRTag}`,
  };
  await CountRTags.create(obj);
  // await User.findOneAndUpdate(
  //   { _id: userId },
  //   { $set: { isRegistrationCompleted: true } }
  // );
};

module.exports.checkAndProvideCountRTag = async (req) => {
  const { userId } = req.query;
  const user = await User.findOne({ _id: userId, status: STATUS.ACTIVE });

  if (!user) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "User doesn't exist.",
    });
    return;
  }

  let [firstName = "", lastName = ""] = user.fullName.split(" ");

  const isUsernameExists = async (username) => {
    return CountRTags.exists({ countRTag: username });
  };

  const generateUniqueUsername = async (baseUsername) => {
    let uniqueUsername = baseUsername;
    let attempt = 1;

    while (await isUsernameExists(uniqueUsername)) {
      let randomNum = Math.floor(100 + Math.random() * 900);
      uniqueUsername = `${baseUsername}${randomNum}`;
      attempt++;
      if (attempt > 10) break;
    }

    return uniqueUsername;
  };

  let baseUsernames = [
    `@${firstName.toLowerCase()}.${lastName.toLowerCase()}`,
    `@${lastName.toLowerCase()}.${firstName.toLowerCase()}`,
    `@${firstName.toLowerCase()}.${lastName.toLowerCase()}89`,
    `@${lastName.toLowerCase()}.${firstName.toLowerCase()}14`,
  ].filter(Boolean);

  let uniqueUsernames = [];
  for (let base of baseUsernames) {
    uniqueUsernames.push(await generateUniqueUsername(base));
  }

  const existingTags = await CountRTags.distinct("countRTag");

  const availableTags = uniqueUsernames.filter(
    (tag) => !existingTags.includes(tag)
  );

  return availableTags;
};

module.exports.logoutUser = async (req) => {
  const { userId } = req;
  const user = await User.findById(userId, { _id: 1 });
  const prefix = KEY_TYPE_PREFIXES.USER_TOKEN;
  await redisClient.del(`${prefix}:${user._id}`);
};

module.exports.deleteAccount = async (req) => {
  const { userId } = req;
  const user = await User.findById(userId);
  if (!user) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "User doesn't exist.",
    });
  }
  await User.updateOne({ _id: userId }, { $set: { status: STATUS.DELETED } });
};
