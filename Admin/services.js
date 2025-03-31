const bcrypt = require("bcrypt");

const Admin = require("../Models/Admin");
const Orders = require("../Models/Order");
const User = require("../Models/User");
const EntityDetails = require("../Models/EntityDetails");

const {
  ORDER_STATUS,
  ROLES,
  STATUS_CODES,
  STATUS,
  EDIT_ACTION,
} = require("../Utils/globalConstants");
const throwError = require("./../Utils/throwError");
const { comparePassword, getJwtToken } = require("../Utils/commonFunction");
const Order = require("../Models/Order");

const addAdmin = async (req) => {
  const { firstName, lastName, password, email, phoneNumber } = req.body;
  const admin = await Admin.findOne({ email }).lean();
  if (admin) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Admin with this email already exist.",
    });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);

  const adminObj = {
    firstName,
    lastName,
    password: hashedPassword,
    email,
    phoneNumber,
    status: STATUS.ACTIVE,
  };

  return Admin.create(adminObj);
};

const loginAdmin = async (req) => {
  const { email, password } = req.body;
  const admin = await Admin.findOne(
    { email, status: STATUS.ACTIVE },
    {
      firstName: 1,
      lastName: 1,
      email: 1,
      phoneNumber: 1,
      password: 1,
    }
  ).lean();
  if (!admin) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Admin doesn't exist",
    });
  }

  const isPasswordValid = await comparePassword(password, admin.password);
  if (!isPasswordValid) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: "Invalid password",
    });
  }

  const token = getJwtToken(admin, true);
  delete admin.password;
  return { token, isAdmin: true };
};

const getAdmins = async (req) => {
  const admins = await Admin.find({ status: STATUS.ACTIVE });
  return admins;
};

const editAdmin = async (req) => {
  const {
    adminId,
    email,
    phoneNumber,
    firstName,
    lastName,
    status,
    action,
    password,
  } = req.body;

  let msg = "";
  const admin = await Admin.findOne({ _id: adminId });
  if (!admin) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Admin doesn't exist.",
    });
  }
  if ((action = EDIT_ACTION.EDIT)) {
    if (firstName) admin.firstName = firstName;
    if (lastName) admin.lastName = lastName;
    if (email) admin.email = email;
    if (phoneNumber) admin.phoneNumber = phoneNumber;
    if (password) {
      const hashedPassword = bcrypt.hashSync(password, 10);
      admin.password = hashedPassword;
    }

    message = "Admin details updated successfully.";
    return admin.save();
  } else if (action === EDIT_ACTION.DELETE) {
    if (status) admin.status = status;

    message = "Admin delted successfully.";
    return admin.save();
  }
  return msg;
};

const getUsers = async (req) => {
  const {
    query: { pageNo = 1, pageLimit = 10 },
  } = req;
  const skip = +(pageNo - 1) * +pageLimit;
  const query = { status: STATUS.ACTIVE, role: ROLES.CUSTOMER };
  const [users, totalCount] = await Promise.all([
    User.find(query).sort({ firstName: 1 }).skip(skip).limit(pageLimit).lean(),
    User.countDocuments(query),
  ]);
  return { users, totalCount };
};

const getRestaurants = async (req) => {
  const {
    body: { pageNo = 1, pageLimit = 10 },
  } = req;
  const skip = +(pageNo - 1) * +pageLimit;
  const query = { status: STATUS.ACTIVE };
  const [entity, totalCount] = await Promise.all([
    EntityDetails.find(query).skip(skip).limit(pageLimit).lean(),
    EntityDetails.countDocuments(query),
  ]);
  return { entity, totalCount };
};

const getRestaurantOrders = async (req) => {
  const { entityId } = req.body;

  const orders = await Order.find({ entityId });
  if (!orders.length) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Orders not found.",
    });
  }

  const totalOrders = orders.length;

  const [revenueData] = await Order.aggregate([
    {
      $match: { status: ORDER_STATUS.COMPLETED },
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$finalAmount" },
      },
    },
  ]);

  const totalRevenue = revenueData?.totalRevenue || 0;

  return { orders, totalOrders, totalRevenue };
};

module.exports = {
  addAdmin,
  loginAdmin,
  getAdmins,
  editAdmin,
  getUsers,
  getRestaurants,
  getRestaurantOrders,
};
