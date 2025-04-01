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
const { generatePresignedUrl } = require("../Controller/aws-service");

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
    isAdmin: true,
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
  let {
    query: { pageNo = 1, pageLimit = 10 },
  } = req;

  if (typeof pageLimit === "string") {
    pageLimit = parseInt(pageLimit, 10);
  }
  const skip = +(pageNo - 1) * +pageLimit;
  const query = { status: STATUS.ACTIVE };
  const admins = await Admin.find(query).skip(skip).limit(pageLimit).lean();
  const totalCount = await Admin.countDocuments(query);
  return { data: admins, totalCount };
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
  if (action === EDIT_ACTION.EDIT) {
    if (firstName) admin.firstName = firstName;
    if (lastName) admin.lastName = lastName;
    if (email) admin.email = email;
    if (phoneNumber) admin.phoneNumber = phoneNumber;
    if (password) {
      const hashedPassword = bcrypt.hashSync(password, 10);
      admin.password = hashedPassword;
    }

    msg = "Admin details updated successfully.";
    return admin.save();
  } else if (action === EDIT_ACTION.DELETE) {
    if (status) admin.status = status;

    msg = "Admin deleted successfully.";
    return admin.save();
  }
  return msg;
};

const getUsers = async (req) => {
  let {
    query: { pageNo = 1, pageLimit = 10, searchTerm },
  } = req;

  if (typeof pageLimit === "string") {
    pageLimit = parseInt(pageLimit, 10);
  }

  const skip = +(pageNo - 1) * +pageLimit;
  const query = { status: STATUS.ACTIVE, role: ROLES.CUSTOMER };
  if (searchTerm) {
    query.fullName = { $regex: searchTerm, $options: "i" };
  }
  const [users, totalCount] = await Promise.all([
    User.find(query).sort({ firstName: 1 }).skip(skip).limit(pageLimit).lean(),
    User.countDocuments(query),
  ]);
  return { users, totalCount };
};

const getRestaurants = async (req) => {
  let {
    query: { pageNo = 1, pageLimit = 10, searchTerm },
  } = req;

  if (typeof pageLimit === "string") {
    pageLimit = parseInt(pageLimit, 10);
  }
  const skip = +(pageNo - 1) * +pageLimit;

  const query = { status: STATUS.ACTIVE };
  if (searchTerm) {
    query.entityName = { $regex: searchTerm, $options: "i" };
  }
  const [entity, totalCount] = await Promise.all([
    EntityDetails.find(query).skip(skip).limit(pageLimit).lean(),
    EntityDetails.countDocuments(query),
  ]);
  entity.map((logo) => {
    logo.image = generatePresignedUrl(logo.image);
  });
  return { entity, totalCount };
};

const getRestaurantOrders = async (req) => {
  let { entityId, pageNo = 1, pageLimit = 10 } = req.query;

  if (typeof pageLimit === "string") {
    pageLimit = parseInt(pageLimit, 10);
  }
  const skip = +(pageNo - 1) * +pageLimit;

  const orders = await Order.find({ entityId })
    .populate({ path: "counterId", select: "counterName" })
    .populate({ path: "items.itemId", select: "itemName quantity currency" })
    .skip(skip)
    .limit(pageLimit)
    .lean();

  if (!orders.length) {
    return [];
  }

  const totalOrders = orders.length;

  const [revenueData] = await Order.aggregate([
    {
      $match: {
        status: {
          $in: [
            ORDER_STATUS.COMPLETED,
            ORDER_STATUS.WAITING,
            ORDER_STATUS.IN_PROGRESS,
            ORDER_STATUS.READY,
          ],
        },
      },
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
