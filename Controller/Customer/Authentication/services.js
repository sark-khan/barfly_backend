// const User = require("../../../Models/User");
const crypto = require("crypto");
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

module.exports.register = async (req) => {
  const {
    email,
    otp,
    role,
    firstName,
    lastName,
    contactNumber,
    city,
    street,
    zipcode,
    entityName,
    entityType,
    password,
  } = req.body;

  const userExist = await User.findOne({ email }).lean();
  if (userExist) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: "User already registerd",
    });
  }

  const otpDetails = await Otp.findOne({ email });
  if (otpDetails.otp != otp) {
    throwError({
      status: STATUS_CODES.NOT_ACCEPTABLE,
      message: "Invalid Otp",
    });
  }

  const currentTime = new Date();

  const timeDifference = currentTime - otpDetails.updatedAt;

  if (timeDifference > 5 * 60 * 1000) {
    throwError({
      message: "Otp is expired. Please regenrate it",
      status: STATUS_CODES.NOT_ACCEPTABLE,
    });
  }
  const hashedPassword = hashPassword(password);
  const newUser = new User({
    role,
    firstName,
    lastName,
    email,
    password: hashedPassword,
    contactNumber,
    city,
    street,
    zipcode,
    entityName,
    entityType,
  });
  delete newUser.password;
  await newUser.save();
  return newUser;
};

module.exports.login = async (req) => {
  const { emailOrContactNumber, password } = req.body;
  const userProjection = {
    role: 1,
    firstName: 1,
    lastName: 1,
    email: 1,
    contactNumber: 1,
    password: 1,
    entityName: 1,
    entityType: 1,
  };

  const user = await User.findOne(
    {
      $or: [
        { email: emailOrContactNumber },
        { contactNumber: emailOrContactNumber },
      ],
    },
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

  const token = getJwtToken(user, true);
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
  const otp = crypto.randomInt(100000, 999999).toString();
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

module.exports.reSendOtp = async (req) => {
  const { email } = req.body;
  const otp = generateOTP(6);
  const otpDetails = Otp.findOne({ email });
  if (!otpDetails) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message:
        "Error processing the Otp Request. Please generate Otp first to regenerate Otp",
    });
  }
  otpDetails.otp = otp;

  await otpDetails.save();
  const mail_data = {
    to: email,
    subject: "COUNTR: Otp for authentication",
    text: `Please use the below OTP for registering your account on Countr: \n 
    ${otp}
    `,
  };
  await createMail(mail_data);
};
