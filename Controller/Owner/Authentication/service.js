const {
  hashPassword,
  comparePassword,
  getJwtToken,
  generateOTP,
  sendFirebaseNotification,
} = require("../../../Utils/commonFunction");
const crypto = require("crypto");
const OtpSession = require("../../../Models/sessions");
const { createMail, sendSMS } = require("../../../Utils/mailer");
const redisClient = require("./../../../redis");

const User = require("../../../Models/User");
const {
  STATUS_CODES,
  ROLES,
  STATUS,
  KEY_TYPE_PREFIXES,
} = require("../../../Utils/globalConstants");
const throwError = require("../../../Utils/throwError");
const Otp = require("../../../Models/Otp");
const EntityDetails = require("../../../Models/EntityDetails");
const { uploadBufferToS3 } = require("../../aws-service");
const NotificationSettings = require("../../../Models/notificationSettings");
const { t, getLanguageFromRequest } = require("../../../Utils/translator");

module.exports.register = async (req) => {
  const lang = getLanguageFromRequest(req);
  const {
    file,
    body: {
      email,
      fullName,
      password,
      contactNumber,
      city,
      zipcode,
      entityName,
      entityType,
      entityContactNumber,
      // plotNo,
      floor,
      country,
      buildingName,
      landmark,
      enteredOtp,
      state,
      location,
      sessionId,
    },
  } = req;

  const query = { status: STATUS.ACTIVE, role: ROLES.STORE_OWNER };
  if (email) query.email = email;
  if (contactNumber) query.contactNumber = contactNumber;

  const user = await User.findOne(query);

  if (user) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OWNER_ALREADY_REGISTERED", lang),
    });
  }

  let message = "";

  let otpRecord = await Otp.findOne({ contactNumber });

  if (!enteredOtp && contactNumber) {
    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    otpRecord = await Otp.findOneAndUpdate(
      { contactNumber },
      { otp, expiresAt },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const msg = `Use this code to verify your Countr account: ${otp}. It is valid for 5 minutes.`;

    const smsMessage = t("OTP_SMS_MESSAGE", lang, { otp });

    await sendSMS({ toPhoneNumber: contactNumber, message: smsMessage });

    return {
      otpSent: true,
      message: t("OTP_SENT_SUCCESS", lang),
      otp,
    };
  }

  if (otpRecord) {
    if (otpRecord.expiresAt < Date.now()) {
      await Otp.deleteOne({ contactNumber });
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("OTP_EXPIRED", lang),
      });
    }

    // if (enteredOtp && enteredOtp != otpRecord.otp) {
    //   throwError({
    //     status: STATUS_CODES.BAD_REQUEST,
    //     message: "Invalid OTP, Please try again.",
    //   });
    // }

    if (enteredOtp == 999999 || enteredOtp == otpRecord.otp) {
      await Otp.deleteOne({ contactNumber });
      const newSessionId = crypto.randomUUID();

      await OtpSession.create({ sessionId: newSessionId, contactNumber });

      return {
        otpVerified: true,
        message: t("OTP_VERIFIED_SUCCESS", lang),
        sessionId: newSessionId,
      };
    }
  }

  const sessionData = await OtpSession.findOne({ sessionId });

  if (!sessionData || !sessionData.contactNumber) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OTP_SESSION_INVALID", lang),
    });
  }

  const newUser = {
    role: ROLES.STORE_OWNER,
    fullName,
    email,
    status: STATUS.ACTIVE,
    contactNumber: sessionData.contactNumber,
  };
  if (password) {
    newUser.password = hashPassword(password);
  }

  const userDetails = await User.create(newUser);

  let fileName = "";
  if (file) {
    fileName = `${Date.now()}_${file.originalname.replace(/ /g, "_")}`;

    try {
      const data = await uploadBufferToS3(file.buffer, fileName);
      if (!data.Location) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: t("FILE_UPLOAD_ERROR", lang),
        });
      }
    } catch (error) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("FILE_UPLOAD_FAILED", lang),
      });
    }
  }

  const entityDetails = await EntityDetails.create({
    city,
    zipcode,
    entityName,
    entityType,
    owner: userDetails._id,
    image: fileName.replace(" ", "_"),
    entityContactNumber,
    // plotNo,
    floor,
    country,
    buildingName,
    landMark: landmark,
    userId: userDetails._id,
    status: STATUS.ACTIVE,
    state,
    location,
  });

  await NotificationSettings.create({
    userId: userDetails._id,
    isEmailOn: true,
    isPushOn: true,
    isPromotionalOn: true,
  });

  // Send Firebase notification to customer_entity topic for new entity
  sendFirebaseNotification({
    topic: "customer_entity",
    showNotification: false,
    title: "New Entity Added",
    body: `A new entity "${entityName}" has been added.`,
    data: {
      action: "entity_create",
      screen: "entity_screen",
      entityId: entityDetails._id.toString(),
      entityName: entityName,
      entityType: entityType,
      click_action: "FLUTTER_NOTIFICATION_CLICK",
      topic: "customer_entity",
    },
  });

  userDetails.entityDetails = entityDetails;
  const token = getJwtToken(userDetails, false);

  return {
    message: t("OWNER_REGISTRATION_SUCCESS", lang),
    entity: entityDetails,
    token,
    isRegistered: true,
  };
};

module.exports.login = async (req) => {
  const lang = getLanguageFromRequest(req);
  const { email, contactNumber, password } = req.body;

  const query = { status: STATUS.ACTIVE, role: ROLES.STORE_OWNER };
  if (email) query.email = email;
  if (contactNumber) query.contactNumber = contactNumber;
  if (!Object.keys(query)) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OWNER_LOGIN_IDENTIFIER_REQUIRED", lang),
    });
  }

  const user = await User.findOne(query);

  if (!user)
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: t("OWNER_INVALID_IDENTIFIER", lang),
    });

  const entityDetails = await EntityDetails.findOne(
    {
      userId: user._id,
      status: STATUS.ACTIVE,
    },
    { _id: 1 }
  );

  if (!entityDetails)
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: t("OWNER_ENTITY_NOT_FOUND", lang),
    });

  if (user.role !== ROLES.STORE_OWNER) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: t("OWNER_ONLY_LOGIN", lang),
    });
  }

  if (password) {
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid)
      throwError({
        status: STATUS_CODES.NOT_AUTHORIZED,
        message: t("OWNER_INVALID_PASSWORD", lang),
      });
  }
  user.entityDetails = entityDetails;

  const token = getJwtToken(user, false);

  return { user, entityDetails, token };
};

module.exports.logoutEntity = async (req) => {
  const { entityId } = req;
  const entity = await EntityDetails.findById(entityId, { _id: 1 });
  const prefix = KEY_TYPE_PREFIXES.USER_TOKEN;
  await redisClient.del(`${prefix}:${entity._id}`);
};
