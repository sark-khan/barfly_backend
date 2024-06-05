const User = require("../../Models/User");
const { STATUS_CODES } = require("../../Utils/globalConstants");
const {
  hashPassword,
  comparePassword,
  getJwtToken,
} = require("../../Utils/commonFunction");
const throwError = require("../../Utils/throwError");

module.exports.register = async (req) => {
  const userExist = await User.findOne({ email: req.body.email }).lean();
  if (userExist) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: "User already registerd",
    });
  }

  const hashedPassword = hashPassword(req.body.password);
  const newUser = new User({
    role: req.body.role,
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    email: req.body.email,
    password: hashedPassword,
    contactNumber: req.body.contactNumber,
    city: req.body.city,
    street: req.body.street,
    zipcode: req.body.zipcode,
    productName: req.body.productName,
    productType: req.body.productType,
  });

  await newUser.save();
  return newUser;
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
    productName: 1,
    productType: 1,
  };

  const user = await User.findOne({ email }, userProjection).lean();
  if (!user)
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: "User does not exist",
    });

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
