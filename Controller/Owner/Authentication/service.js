const {
  hashPassword,
  comparePassword,
  getJwtToken,
  generateOTP,
} = require("../../../Utils/commonFunction");
const crypto = require("crypto");
const { createMail, sendSMS } = require("../../../Utils/mailer");

const User = require("../../../Models/User");
const { STATUS_CODES, ROLES } = require("../../../Utils/globalConstants");
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
    street,
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

  if (contactNumber) {
    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await Otp.findOneAndUpdate(
      { email },
      { otp, expiresAt },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const msg = `Your verification code is: ${otp}`;
    await sendSMS({ toPhoneNumber: contactNumber, message: msg });

    const otpRecord = await Otp.findOne({ email });
    if (!otpRecord) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "OTP not found. Please request a new OTP.",
      });
    }

    if (otpRecord.expiresAt < Date.now()) {
      await Otp.deleteOne({ email });
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "Otp Expired! Please resend the OTP.",
      });
    }

    if (enteredOtp !== otpRecord.otp) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "Invalid OTP, Please try again.",
      });
    }
    if (enteredOtp === otp) {
      otpVerified = true;
      message = "OTP verified successfully.";
    }
  }

  if (otpVerified) {
    const hashedPassword = hashPassword(password);
    const newUser = await User.create({
      role: ROLES.STORE_OWNER,
      fullName,
      email,
      password: hashedPassword,
      contactNumber,
    });

    const fileBuffer = req.file.buffer;
    const fileName = `${req.entityId}_${new Date()}_${req.file.originalname}`;
    const data = await uploadBufferToS3(fileBuffer, fileName);
    if (!data.Location) {
      throwError({
        message: "Error occured while uplaoding the file",
        status: STATUS_CODES.SERVER_ERROR,
      });
    }

    const newEntityDetailsObj = {
      city,
      street,
      zipcode,
      entityName,
      entityType,
      owner: newUser._id,
      image: fileName.replace(" ", "_"),
      entityContactNumber,
      plotNo,
      floor,
      country,
      buildingName,
      landMark,
    };

    await EntityDetails.create(newEntityDetailsObj);
    // delete newUser.password;
    // return newUser;
    message = "Registration successful";
  }
  return message;
};

module.exports.login = async (req) => {
  const { email, password } = req.body;
  const userProjection = {
    role: 1,
    firstName: 1,
    lastName: 1,
    email: 1,
    contactNumber: 1,
    password: 1,
  };

  const userAndEntityDetails = await User.aggregate([
    {
      $match: {
        $or: [{ email: email }, { contactNumber: email }],
      },
    },
    {
      $lookup: {
        from: "entitydetails",
        localField: "_id",
        foreignField: "owner",
        as: "entityDetails",
      },
    },
    {
      $unwind: {
        path: "$entityDetails",
        preserveNullAndEmptyArrays: true, // Use this if entityDetails can be empty
      },
    },
    {
      $project: {
        ...userProjection,
        "entityDetails.entityName": 1,
        "entityDetails.entityType": 1,
        "entityDetails._id": 1,
      },
    },
  ]);

  // Accessing the data
  const user = userAndEntityDetails[0];
  console.log({ user });
  if (!user)
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: "User does not exist",
    });
  console.log({ userrrr: user });
  if (user.role !== ROLES.STORE_OWNER) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: "Only owners can log in",
    });
  }

  const isPasswordValid = await comparePassword(password, user.password);
  if (!isPasswordValid)
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: "Invalid passowrd",
    });

  const token = getJwtToken(user);
  delete user.password;

  return { user, token };
};
module.exports.sendOtp = async (req) => {
  const { email, contactNumber } = req.body;
  const userDetails = await User.findOne(
    { $or: [{ email }, { contactNumber }] },
    { _id: 0 }
  );
  if (userDetails) {
    throwError({
      status: STATUS_CODES.CONFLICT,
      message: "This email/contact Number is alredy Registered",
    });
  }
  console.log("reached erher", email);
  const otp = generateOTP(5);
  await Otp.findOneAndUpdate(
    { email },
    { otp },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log({ otp });
  const mail_data = {
    to: email,
    subject: "COUNTR: Otp for authentication",
    text: `Please use the below OTP for registering your account on Countr: \n 
    ${otp}
    `,
  };
  createMail(mail_data);
};

// module.exports.reSendOtp = async (req) => {
//   const { email } = req.body;
//   const otp = generateOTP(5);
//   const otpDetails = await Otp.findOne({ email });
//   if (!otpDetails) {
//     throwError({
//       status: STATUS_CODES.BAD_REQUEST,
//       message:
//         "Error processing the Otp Request. Please generate Otp first to regenerate Otp",
//     });
//   }
//   otpDetails.otp = otp;

//   await otpDetails.save();
//   const mail_data = {
//     to: email,
//     subject: "COUNTR: Otp for authentication",
//     text: `Please use the below OTP for registering your account on Countr: \n
//     ${otp}
//     `,
//   };
//   await createMail(mail_data);
// };
