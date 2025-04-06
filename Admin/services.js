const bcrypt = require("bcrypt");

const Admin = require("../Models/Admin");
const Stripe = require("../Models/Stripe");
const User = require("../Models/User");
const EntityDetails = require("../Models/EntityDetails");
const redisClient = require("../redis");

const {
  ORDER_STATUS,
  ROLES,
  STATUS_CODES,
  STATUS,
  EDIT_ACTION,
  KEY_TYPE_PREFIXES,
} = require("../Utils/globalConstants");
const throwError = require("./../Utils/throwError");
const {
  comparePassword,
  getJwtToken,
  encrypt,
  decrypt,
} = require("../Utils/commonFunction");
const Order = require("../Models/Order");
const { generatePresignedUrl } = require("../Controller/aws-service");
const { createMail } = require("../Utils/mailer");

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
    query: { pageNo = 1, pageLimit = 10, searchTerm },
  } = req;

  if (typeof pageLimit === "string") {
    pageLimit = parseInt(pageLimit, 10);
  }
  const skip = +(pageNo - 1) * +pageLimit;
  const query = { status: STATUS.ACTIVE };
  if (searchTerm) {
    query.$or = [
      { firstName: { $regex: searchTerm, $options: "i" } },
      { lastName: { $regex: searchTerm, $options: "i" } },
    ];
  }

  const admins = await Admin.find(query).skip(skip).limit(pageLimit).lean();
  admins.forEach((pass) => {
    delete pass.password;
  });
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
    query: { pageNo = 1, pageLimit = 10, searchTerm, status },
  } = req;

  if (typeof pageLimit === "string") {
    pageLimit = parseInt(pageLimit, 10);
  }

  const skip = +(pageNo - 1) * +pageLimit;
  const query = {
    status: { $in: [STATUS.ACTIVE, STATUS.BLOCKED] },
    role: ROLES.CUSTOMER,
  };
  if (status) {
    query.status = status;
  }

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
    query: { pageNo = 1, pageLimit = 10, searchTerm, status },
  } = req;

  if (typeof pageLimit === "string") {
    pageLimit = parseInt(pageLimit, 10);
  }
  const skip = +(pageNo - 1) * +pageLimit;

  const query = { status: { $in: [STATUS.ACTIVE, STATUS.BLOCKED] } };
  if (status) {
    query.status = status;
  }

  if (searchTerm) {
    query.entityName = { $regex: searchTerm, $options: "i" };
  }
  const [entity, totalCount] = await Promise.all([
    EntityDetails.find(query)
      .skip(skip)
      .limit(pageLimit)
      .populate({ path: "userId", select: "email", model: "User" })
      .lean(),
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

  const totalOrders = await Order.countDocuments();

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

const getTransactionLogs = async (req) => {
  let {
    query: { pageNo = 1, pageLimit = 10 },
  } = req;

  if (typeof pageLimit === "string") {
    pageLimit = parseInt(pageLimit, 10);
  }
  const skip = +(pageNo - 1) * +pageLimit;
  const transactions = await Stripe.find()
    .populate({
      path: "userId",
      select: "fullName",
    })
    .skip(skip)
    .limit(pageLimit);
  const totalCount = await Stripe.countDocuments();
  return { transactions, totalCount };
};

const getAdminUserDetails = async (req) => {
  const { userId } = req;
  const adminDetails = await Admin.findOne({ _id: userId }).lean();
  delete adminDetails.password;
  return adminDetails;
};

const getDashboardAnalytics = async (req) => {
  const query = { status: STATUS.ACTIVE, role: ROLES.CUSTOMER };

  const users = await User.countDocuments(query);
  const entities = await EntityDetails.countDocuments({
    status: STATUS.ACTIVE,
  });
  const [revenue] = await Order.aggregate([
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
    { $group: { _id: null, totalRevenue: { $sum: "$finalAmount" } } },
  ]);
  const totalRevenue = revenue?.totalRevenue || 0;
  return { users, entities, totalRevenue };
};

const editRestaurantsOrUsers = async (req) => {
  const { entityId, userId, status } = req.body;

  const updateOperations = [];
  let message = "";

  if (entityId) {
    const entity = await EntityDetails.findOne({
      _id: entityId,
      status: { $in: [STATUS.ACTIVE, STATUS.BLOCKED] },
    }).lean();

    if (!entity) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "Entity doesn't exist.",
      });
    }

    updateOperations.push(
      EntityDetails.updateOne({ _id: entityId }, { $set: { status } })
    );
    message = "Restaurant updated successfully.";
  }

  if (userId) {
    const user = await User.findOne({
      _id: userId,
      status: STATUS.ACTIVE,
      role: ROLES.CUSTOMER,
    }).lean();

    if (!user) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "User doesn't exist.",
      });
    }

    updateOperations.push(
      User.updateOne({ _id: userId }, { $set: { status } })
    );
    message = "User updated successfully.";
  }

  await Promise.all(updateOperations);
};

// const resetPassword = async (req) => {
//   const { email, newPassword } = req.body;

//   let message = "";
//   const admin = await Admin.findOne({ email, status: STATUS.ACTIVE });
//   if (!admin) {
//     throwError({
//       status: STATUS_CODES.BAD_REQUEST,
//       message: "Admin not found.",
//     });
//   }
//   const fullName = `${admin.firstName} ${admin.lastName}`;

//   if (email) {
//     const resetLink = `${process.env.HOST_URL}/api/admins/reset-password`;
//     const mailData = {
//       to: email,
//       subject: "COUNTR: Reset Password Request",
//       text: `Hello ${fullName},

// We have received a request to reset your password for your Countr admin account. Please click the link below to reset your password:

// Reset Password: ${resetLink}

// If you did not request this change, please ignore this email.

// Thank you,
// The Countr Team`,
//     };
//     createMail(mailData);

//     message = "Email has been sent";
//   }

//   if (newPassword) {
//     const hashedPassword = await bcrypt.hash(newPassword, 10);
//     admin.password = hashedPassword;
//     await admin.save();
//   }
//   message = "Password updated successfully.";
// };

const resetPassword = async (req) => {
  const { email, password, authToken } = req.body;

  let message = "";

  if (authToken && password) {
    const decryptedUserId = decrypt(authToken);

    const redisPrefix = KEY_TYPE_PREFIXES.USER_TOKEN;
    const storedToken = await redisClient.get(redisPrefix + decryptedUserId);

    if (!storedToken || storedToken !== authToken) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "Session expired try again.",
      });
    }

    const adminToUpdate = await Admin.findById(decryptedUserId);
    if (!adminToUpdate) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "Session expired try again.",
      });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    adminToUpdate.password = hashedPassword;

    await adminToUpdate.save();

    await redisClient.del(redisPrefix + decryptedUserId);

    return { message: "Password updated successfully." };
  } else {
    const adminUser = await Admin.findOne(
      { email, status: STATUS.ACTIVE },
      { email: 1, firstName: 1, lastName: 1, _id: 1 }
    );

    if (!adminUser) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "Admin user doesn't exist.",
      });
    }

    const authToken = encrypt(adminUser._id.toString());

    const redisPrefix = KEY_TYPE_PREFIXES.USER_TOKEN;
    await redisClient.setEx(
      redisPrefix + adminUser._id.toString(),
      20 * 60,
      authToken
    );

    const fullName = `${adminUser.firstName} ${adminUser.lastName}`;

    const resetLink = `${process.env.HOST_URL}/api/admins/reset-password?auth=${authToken}`;
    const mailData = {
      to: email,
      subject: "COUNTR: Reset Password Request",
      text: `Hello ${fullName},
    
    We have received a request to reset your password for your Countr admin account. Please click the link below to reset your password:
    
    Reset Password: ${resetLink}
    
    If you did not request this change, please ignore this email.
    
    Thank you,
    The Countr Team`,
    };
    createMail(mailData);

    return { message: "Email has been sent", emailSent: true };
  }
  return message;
};

const logoutAdmin = async (req) => {
  const { userId } = req;
  const admin = await Admin.findById(userId, { _id: 1 });
  const prefix = KEY_TYPE_PREFIXES.USER_TOKEN;
  await redisClient.del(`${prefix}:${admin._id}`);
};

module.exports = {
  addAdmin,
  loginAdmin,
  getAdmins,
  editAdmin,
  getUsers,
  getRestaurants,
  getRestaurantOrders,
  getTransactionLogs,
  getAdminUserDetails,
  getDashboardAnalytics,
  editRestaurantsOrUsers,
  resetPassword,
  logoutAdmin,
};
