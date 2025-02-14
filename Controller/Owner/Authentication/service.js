const {
  hashPassword,
  comparePassword,
  getJwtToken,
  generateOTP,
} = require("../../../Utils/commonFunction");
const crypto = require("crypto");
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

module.exports.register = async (req) => {
  const {
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
  } = req.body;
  const userExist = await User.findOne({ email }).lean();
  if (userExist) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: "User already registerd",
    });
  }
  let otpVerified = false;
  let message = "";
  let otpSent = false;
  if (contactNumber && !otpSent) {
    let otpRecord = await Otp.findOne({ contactNumber });

    if (!otpRecord || otpRecord.expiresAt < Date.now()) {
      // Generate a new OTP if there's no existing record or if it has expired
      const otp = crypto.randomInt(100000, 999999).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      otpRecord = await Otp.findOneAndUpdate(
        { contactNumber },
        { otp, expiresAt },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // const msg = `Your verification code is: ${otp}`;
      // await sendSMS({ toPhoneNumber: contactNumber, message: msg });

      message = "OTP sent successfully.";
      return { otpSent: true, message, otp };

      // return { message, otpSent }; // Exit after sending OTP to avoid immediate verification
    }

    console.log({ otpRecord });

    // if (!enteredOtp) {
    //   throwError({
    //     status: STATUS_CODES.BAD_REQUEST,
    //     message: "Please enter OTP.",
    //   });
    // }

    if (otpRecord.expiresAt < Date.now()) {
      await Otp.deleteOne({ contactNumber });
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "OTP Expired! Please resend the OTP.",
      });
    }

    console.log({ enteredOtp, otp: otpRecord.otp });

    if (enteredOtp && enteredOtp !== otpRecord.otp) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "Invalid OTP, Please try again.",
      });
    }

    // OTP matched
    if (enteredOtp && enteredOtp == otpRecord.otp) {
      message = "OTP verified successfully.";

      await Otp.deleteOne({ contactNumber });
      return { otpVerified: true, message };
    }
  }

  if (otpVerified) {
    console.log("aa rha hai????????????????????");
    const newUser = await User.create({
      role: ROLES.STORE_OWNER,
      fullName,
      email,
      contactNumber,
      status: STATUS.ACTIVE,
    });
    if (password) {
      const hashedPassword = hashPassword(password);
      newUser.password = hashedPassword;
    }
    // if (req.file) {
    //   const fileBuffer = req.file.buffer;
    //   const fileName = `${req.entityId}_${new Date()}_${req.file.originalname}`;
    //   const data = await uploadBufferToS3(fileBuffer, fileName);
    //   if (!data.Location) {
    //     throwError({
    //       message: "Error occured while uplaoding the file",
    //       status: STATUS_CODES.SERVER_ERROR,
    //     });
    //   }
    // }

    const newEntityDetailsObj = {
      city,
      zipcode,
      entityName,
      entityType,
      owner: newUser._id,
      // image: fileName.replace(" ", "_"),
      entityContactNumber,
      plotNo,
      floor,
      country,
      buildingName,
      landMark,
      userId: newUser._id,
      status: STATUS.ACTIVE,
      state,
      location,
    };

    await EntityDetails.create(newEntityDetailsObj);
    delete newUser.password;

    return { message: "Registration successful" };
  }
};

module.exports.login = async (req) => {
  const { email, password } = req.body;
  // const userProjection = {
  //   role: 1,
  //   firstName: 1,
  //   lastName: 1,
  //   email: 1,
  //   contactNumber: 1,
  //   // password: 1,
  // };

  // const userAndEntityDetails = await User.aggregate([
  //   {
  //     $match: {
  //       $or: [{ email: email }, { contactNumber: email }],
  //     },
  //   },
  //   {
  //     $lookup: {
  //       from: "entitydetails",
  //       localField: "_id",
  //       foreignField: "owner",
  //       as: "entityDetails",
  //     },
  //   },
  //   {
  //     $unwind: {
  //       path: "$entityDetails",
  //       preserveNullAndEmptyArrays: true,
  //     },
  //   },
  //   {
  //     $project: {
  //       ...userProjection,
  //       "entityDetails.entityName": 1,
  //       "entityDetails.entityType": 1,
  //       "entityDetails._id": 1,
  //     },
  //   },
  // ]);

  // const user = userAndEntityDetails[0];

  // const user = await User.findOne({ email });
  // const entityDetails = await EntityDetails.findOne({ userId });

  const [user, entityDetails] = await Promise.all([
    User.findOne({ email }).exec(),
    EntityDetails.findOne({ userId: user._id }).exec(),
  ]);

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

  const token = getJwtToken(user);

  return { user, entityDetails, token };
};
