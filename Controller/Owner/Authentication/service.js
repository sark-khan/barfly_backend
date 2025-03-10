const {
  hashPassword,
  comparePassword,
  getJwtToken,
  generateOTP,
} = require("../../../Utils/commonFunction");
const crypto = require("crypto");
const OtpSession = require("../../../Models/sessions");
const { createMail, sendSMS } = require("../../../Utils/mailer");

const User = require("../../../Models/User");
const {
  STATUS_CODES,
  ROLES,
  STATUS,
} = require("../../../Utils/globalConstants");
const throwError = require("../../../Utils/throwError");
const Otp = require("../../../Models/Otp");
const EntityDetails = require("../../../Models/EntityDetails");
const { uploadBufferToS3 } = require("../../aws-service");

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
      landMark,
      enteredOtp,
      state,
      location,
      sessionId,
    },
  } = req;

  const userExist = await User.findOne({ $or: [{ email }, { contactNumber }] });
  if (userExist) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "User already registered",
    });
  }

  let message = "";

  if (contactNumber) {
    let otpRecord = await Otp.findOne({ contactNumber });

    if (!otpRecord || otpRecord.expiresAt < Date.now()) {
      const otp = crypto.randomInt(100000, 999999).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      otpRecord = await Otp.findOneAndUpdate(
        { contactNumber },
        { otp, expiresAt },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const msg = `Your verification code is: ${otp}`;
      await sendSMS({ toPhoneNumber: contactNumber, message: msg });

      message = "OTP sent successfully.";
      return { otpSent: true, message, otp };
    }

    if (otpRecord.expiresAt < Date.now()) {
      await Otp.deleteOne({ contactNumber });
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "OTP Expired! Please resend the OTP.",
      });
    }

    if (enteredOtp && enteredOtp != otpRecord.otp) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "Invalid OTP, Please try again.",
      });
    }

    if (enteredOtp && enteredOtp == otpRecord.otp) {
      await Otp.deleteOne({ contactNumber });
      const sessionId = crypto.randomUUID();

      await OtpSession.create({ sessionId, contactNumber });
      return {
        otpVerified: true,
        message: "OTP verified successfully.",
        sessionId,
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
    landMark,
    userId: userDetails._id,
    status: STATUS.ACTIVE,
    state,
    location,
  });

  userDetails.entityDetails = entityDetails;
  const token = getJwtToken(userDetails, false);

  return {
    message: "Registration successful",
    entity: entityDetails,
    token,
  };
};

module.exports.login = async (req) => {
  const { email, contactNumber, password } = req.body;

  const user = await User.findOne({ $or: [{ email }, { contactNumber }] });
  console.log({ user });
  const entityDetails = await EntityDetails.findOne({ userId: user._id });

  if (email && contactNumber) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Please enter either email or password.",
    });
  }

  if (email != user.email || contactNumber != user.contactNumber) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message:
        "Please enter correct details of email/contact number or password.",
    });
  }

  if (!user)
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: "User does not exist",
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
        message: "Invalid paaword.",
      });
  }
  user.entityDetails = entityDetails;

  const token = getJwtToken(user, false);

  return { user, entityDetails, token };
};
