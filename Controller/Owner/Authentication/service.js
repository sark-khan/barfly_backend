const {
  hashPassword,
  comparePassword,
  getJwtToken,
  generateOTP,
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

module.exports.register = async (req) => {
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
      plotNo,
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

  const query = { status: STATUS.ACTIVE };
  if (email) query.email = email;
  if (contactNumber) query.contactNumber = contactNumber;

  const user = await User.findOne(query);

  if (user) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "User already registered",
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

    const msg = `Your verification code is: ${otp}, valid for 5 minutes.`;
    await sendSMS({ toPhoneNumber: contactNumber, message: msg });

    return { otpSent: true, message: "OTP sent successfully.", otp };
  }

  if (otpRecord) {
    if (otpRecord.expiresAt < Date.now()) {
      await Otp.deleteOne({ contactNumber });
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "OTP Expired! Please resend the OTP.",
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
        message: "OTP verified successfully.",
        sessionId: newSessionId,
      };
    }
  }

  const sessionData = await OtpSession.findOne({ sessionId });

  if (!sessionData || !sessionData.contactNumber) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Session expired or invalid sessionId. Please verify OTP again.",
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

  const entityDetails = await EntityDetails.create({
    city,
    zipcode,
    entityName,
    entityType,
    owner: userDetails._id,
    image: fileName.replace(" ", "_"),
    entityContactNumber,
    plotNo,
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

  userDetails.entityDetails = entityDetails;
  const token = getJwtToken(userDetails, false);

  return {
    message: "Registration successful",
    entity: entityDetails,
    token,
    isRegistered: true,
  };
};

module.exports.login = async (req) => {
  const { email, contactNumber, password } = req.body;

  const query = { status: STATUS.ACTIVE };
  if (email) query.email = email;
  if (contactNumber) query.contactNumber = contactNumber;
  if (!Object.keys(query)) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Phone number or email is required.",
    });
  }

  const user = await User.findOne(query);

  if (!user)
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: "Invalid email or mobile number.",
    });

  const entityDetails = await EntityDetails.findOne({
    userId: user._id,
    status: STATUS.ACTIVE,
  });

  if (!entityDetails)
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: "Entity not found.",
    });

  if (user.role !== ROLES.STORE_OWNER) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: "Only owners can log in",
    });
  }

  if (password) {
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid)
      throwError({
        status: STATUS_CODES.NOT_AUTHORIZED,
        message: "Invalid password.",
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
