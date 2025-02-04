const { STATUS_CODES, ROLES } = require("../../../Utils/globalConstants");
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
  } = req.body;

  const userExist = await User.findOne({ email }).lean();
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
  });

  delete userObj.password;
  return userObj;
};

module.exports.login = async (req) => {
  const { email, password } = req.body;
  const userProjection = {
    role: 1,
    firstName: 1,
    lastName: 1,
    email: 1,
    password: 1,
  };

  const user = await User.findOne({ email }, userProjection).lean();

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

  const token = getJwtToken(user, true);
  delete user.password;

  return { user, token };
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
    countRTag,
  };
  await CountRTags.create(obj);
};

// module.exports.sendOtp = async (req) => {
//   const { email, contactNumber } = req.body;
//   const userDetails = await User.findOne(
//     { $or: [{ email }, { contactNumber }] },
//     { _id: 0 }
//   );
//   if (userDetails) {
//     throwError({
//       status: STATUS_CODES.CONFLICT,
//       message: "This email/contact Number is alredy Registered",
//     });
//   }
//   const otp = crypto.randomInt(100000, 999999).toString();
//   await Otp.findOneAndUpdate(
//     { email },
//     { otp },
//     { upsert: true, new: true, setDefaultsOnInsert: true }
//   );
//   console.log({ otp });
//   const mail_data = {
//     to: email,
//     subject: "COUNTR: Otp for authentication",
//     text: `Please use the below OTP for registering your account on Countr: \n
//     ${otp}
//     `,
//   };
//   createMail(mail_data);
// };

// module.exports.reSendOtp = async (req) => {
//   const { email } = req.body;
//   const otp = generateOTP(6);
//   const otpDetails = Otp.findOne({ email });
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
