const User = require("../../Models/User");
const { STATUS_CODES } = require("../../Utils/globalConstants");
const { hashPassword, comparePassword } = require("../../Utils/commonFunction");
const throwError = require("../../Utils/throwError");

module.exports.register = async (req) => {
  const userExist = await User.findOne({ email: req.body.email }).lean();
  if (userExist) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: "User already registerd",
    });
  }

  const hashedPassword = await hashPassword(req.body.password);
  const newUser = new User({
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    email: req.body.email,
    password: hashedPassword,
    confirmPassword: hashedPassword,
  });

  await newUser.save();
  return newUser;
};

module.exports.login = async (req) => {
  const user = await User.findOne({ email: req.body.email }).lean();
  if (!user)
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: "User does not exist",
    });

  const isPasswordValid = await comparePassword(
    req.body.password,
    user.password 
  );
  if (!isPasswordValid)
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: "Invalid passowrd",
    });

  return user;
};
