const Admin = require("../Models/Admin");
const Orders = require("../Models/Order");
const User = require("../Models/User");
const bcrypt = require("bcrypt");

const {
  ORDER_STATUS,
  ROLES,
  STATUS_CODES,
  STATUS,
} = require("../Utils/globalConstants");
const throwError = require("./../Utils/throwError");
const { comparePassword, getJwtToken } = require("../Utils/commonFunction");

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
  const admins = await Admin.find();
  return admins;
};

const totalRevenueOfEntity = async (req) => {
  const { entityId } = req.body;
  const query = { status: ORDER_STATUS.COMPLETED };
  if (entityId) {
    query.entityId = entityId;
  }
  const totalRevenue = await Orders.aggregate([
    { $match: query },
    { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" } } },
  ]);

  return totalRevenue[0]?.totalRevenue || 0;
};

const getUsers = async (req) => {
  const {
    body: { pageNo = 1, pageLimit = 10, role },
  } = req;
  const skip = +(pageNo - 1) * +pageLimit;
  const query = { role };
  const [users, totalCount] = await Promise.all([
    User.find(query).sort({ firstName: 1 }).skip(skip).limit(pageLimit).lean(),
    User.countDocuments(query),
  ]);
  return { users, totalCount };
};

const getOrdersAndMoneySpent = async (req) => {
  const {
    body: { status, userId },
  } = req;
  const query = { userId };
  if (status) {
    query.status = status;
  }

  let [noOfOrders, moneySpent] = await Promise.all([
    Orders.countDocuments(query),
    Orders.aggregate([
      { $match: query },
      { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" } } },
    ]),
  ]);

  moneySpent = moneySpent[0]?.moneySpent || 0;
  return { noOfOrders, moneySpent };
};

module.exports = {
  addAdmin,
  loginAdmin,
  getAdmins,
  totalRevenueOfEntity,
  getUsers,
  getOrdersAndMoneySpent,
};
