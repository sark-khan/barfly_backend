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
const notificationSettings = require("../../../Models/notificationSettings");
const { t, getLanguageFromRequest } = require("../../../Utils/translator");

module.exports.register = async (req) => {
  const lang = getLanguageFromRequest(req);
  const { email, firstName, lastName, password, dob, countrTag } = req.body;

  const userExist = await User.findOne({
    email,
    status: STATUS.ACTIVE,
    role: ROLES.CUSTOMER,
  }).lean();
  if (userExist) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("CUSTOMER_ALREADY_REGISTERED_EMAIL", lang),
    });
  }
  const countrTagExists = await User.findOne({
    countrTag,
    status: STATUS.ACTIVE,
  });
  if (countrTagExists) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("COUNTR_TAG_ALREADY_EXISTS", lang),
    });
  }

  const hashedPassword = hashPassword(password);

  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }

  const userObj = await User.create({
    role: ROLES.CUSTOMER,
    fullName: `${firstName} ${lastName}`,
    firstName,
    lastName,
    email,
    password: hashedPassword,
    status: STATUS.ACTIVE,
    countrTag,
  });

  await notificationSettings.create({
    userId: userObj._id,
    isEmailOn: true,
    isPushOn: true,
    isPromotionalOn: true,
  });

  delete userObj.password;

  const token = getJwtToken(userObj, true);
  return { userObj, token };
};

module.exports.login = async (req) => {
  const lang = getLanguageFromRequest(req);
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
    { email, status: STATUS.ACTIVE, role: ROLES.CUSTOMER },
    userProjection
  ).lean();

  if (!user) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: t("CUSTOMER_NOT_FOUND", lang),
    });
  }

  if (user.role !== ROLES.CUSTOMER) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: t("CUSTOMER_ONLY_LOGIN", lang),
    });
  }

  const isPasswordValid = await comparePassword(password, user.password);
  if (!isPasswordValid) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: t("CUSTOMER_INVALID_PASSWORD", lang),
    });
  }

  const token = getJwtToken(user, true);
  delete user.password;
  return { user, token };
};

module.exports.checkAndProvideCountRTag = async (req) => {
  const { firstName, lastName } = req.query;

  const isUsernameExists = async (username) => {
    return User.exists({ countrTag: username, status: STATUS.ACTIVE });
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

  const existingTags = await User.distinct("countrTag", {
    status: STATUS.ACTIVE,
  });

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
  const lang = getLanguageFromRequest(req);
  const { userId } = req;
  const user = await User.findById(userId);
  if (!user) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("CUSTOMER_DOES_NOT_EXIST", lang),
    });
  }
  await Promise.all([
    User.updateOne(
      { _id: userId },
      { $set: { status: STATUS.DELETED, countrTag: null } }
    ),
    CountRTags.deleteMany({ userId }),
  ]);
};
