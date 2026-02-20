const bcrypt = require("bcrypt");

const Admin = require("../Models/Admin");
const Stripe = require("../Models/Stripe");
const Commission = require("../Models/Commission");
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
const { io } = require("../app");
const { t, getLanguageFromRequest } = require("../Utils/translator");
const {
  TransactionsService,
  Configuration,
  HttpBearerAuth,
} = require("wallee");

// Wallee API config for fetching transaction details (lazy init)
let walleeTransactionsService = null;
const getWalleeTransactionsService = () => {
  if (!walleeTransactionsService) {
    const userId = Number(process.env.WALLEE_USER_ID);
    const apiSecret = process.env.WALLEE_API_SECRET;
    if (userId && apiSecret) {
      const httpBearerAuth = new HttpBearerAuth(userId, apiSecret);
      const walleeConfig = new Configuration({ httpBearerAuth });
      walleeTransactionsService = new TransactionsService(walleeConfig);
    }
  }
  return walleeTransactionsService;
};

const addAdmin = async (req) => {
  const lang = getLanguageFromRequest(req);
  const { firstName, lastName, password, email, phoneNumber } = req.body;
  const admin = await Admin.findOne({ email }).lean();
  if (admin) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("ADMIN_EMAIL_EXISTS_ERROR", lang),
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
  const lang = getLanguageFromRequest(req);
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
      message: t("ADMIN_NOT_FOUND_ERROR", lang),
    });
  }

  const isPasswordValid = await comparePassword(password, admin.password);
  if (!isPasswordValid) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: t("ADMIN_INVALID_PASSWORD_ERROR", lang),
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
  const lang = getLanguageFromRequest(req);
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
      message: t("ADMIN_NOT_FOUND_ERROR", lang),
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

    await admin.save();
    return { message: t("ADMIN_UPDATE_SUCCESS", lang) };
  } else if (action === EDIT_ACTION.DELETE) {
    if (status) admin.status = status;
    admin.blockUnblockDate = new Date();

    await admin.save();
    return { message: t("ADMIN_DELETE_SUCCESS", lang) };
  }
  throwError({
    status: STATUS_CODES.BAD_REQUEST,
    message: t("ADMIN_INVALID_ACTION_ERROR", lang),
  });
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
      .sort({ createdAt: -1 })
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

  // Wallee transaction logs from Commission model
  const [commissions, totalCount] = await Promise.all([
    Commission.find()
      .populate({
        path: "userId",
        select: "fullName email",
        model: "User",
      })
      .populate({
        path: "entityId",
        select: "entityName",
        model: "EntityDetails",
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageLimit)
      .lean(),
    Commission.countDocuments(),
  ]);

  // Enrich with Wallee transaction details (payment method, state, customer info)
  const transactions = await Promise.all(
    commissions.map(async (commission) => {
      const merchantSpaceId = commission.metadata?.merchantSpaceId;
      const walleeTransactionId = commission.walleeTransactionId;

      let walleeDetails = {};
      const txService = getWalleeTransactionsService();
      if (txService && merchantSpaceId && walleeTransactionId) {
        try {
          const transaction =
            await txService.getPaymentTransactionsId({
              space: Number(merchantSpaceId),
              id: Number(walleeTransactionId),
              expand: new Set(["paymentConnectorConfiguration"]),
            });
          const connectorName =
            transaction.paymentConnectorConfiguration?.name || null;
          walleeDetails = {
            paymentMethod: connectorName
              ? connectorName.replace(/^Wallee\s*-\s*/i, "")
              : null,
            paymentMethodImage:
              transaction.paymentConnectorConfiguration?.imagePath || null,
            transactionState: transaction.state,
            transactionDate:
              transaction.completedOn ||
              transaction.failedOn ||
              transaction.confirmedOn ||
              transaction.authorizedOn ||
              transaction.createdOn,
            customerEmail: transaction.customerEmailAddress,
            authorizedAmount: transaction.authorizationAmount,
            completedAmount: transaction.completedAmount,
            createdOn: transaction.createdOn,
            completedOn: transaction.completedOn,
            failedOn: transaction.failedOn,
            failureReason: transaction.failureReason,
            lineItems: transaction.lineItems,
          };
        } catch (err) {
          console.error(
            `Failed to fetch Wallee transaction ${walleeTransactionId}:`,
            err.message
          );
          // Fallback to commission metadata
          walleeDetails = {
            transactionState: commission.metadata?.transactionState || null,
            transactionDate:
              commission.metadata?.completedOn ||
              commission.metadata?.failedOn ||
              commission.metadata?.voidedOn ||
              commission.metadata?.declinedOn ||
              commission.createdAt,
          };
        }
      } else {
        walleeDetails = {
          transactionState: commission.metadata?.transactionState || null,
          transactionDate:
            commission.metadata?.completedOn ||
            commission.metadata?.failedOn ||
            commission.metadata?.voidedOn ||
            commission.metadata?.declinedOn ||
            commission.createdAt,
        };
      }

      return {
        _id: commission._id,
        walleeTransactionId: commission.walleeTransactionId,
        totalAmount: commission.totalAmount,
        platformCommission: commission.platformCommission,
        merchantAmount: commission.merchantAmount,
        platformFeesPercent: commission.platformFeesPercent,
        currency: commission.currency,
        commissionStatus: commission.status,
        userId: commission.userId,
        entityId: commission.entityId,
        eventId: commission.eventId,
        createdAt: commission.createdAt,
        ...walleeDetails,
      };
    })
  );

  return { transactions, totalCount };

  // -- Stripe transaction logs (commented out) --
  // const transactions = await Stripe.find()
  //   .populate({
  //     path: "userId",
  //     select: "fullName",
  //     model: "User",
  //   })
  //   .sort({ _id: -1 })
  //   .skip(skip)
  //   .limit(pageLimit);
  // const totalCount = await Stripe.countDocuments();
  // return { transactions, totalCount };
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
  // Total revenue from Wallee commissions (one record per transaction via upsert)
  const [revenue] = await Commission.aggregate([
    { $group: { _id: null, totalRevenue: { $sum: "$platformCommission" } } },
  ]);
  const totalRevenue = parseFloat((revenue?.totalRevenue || 0).toFixed(2));
  return { users, entities, totalRevenue };

  // -- Old: Stripe-era revenue from Order.platformFees (commented out) --
  // const [revenue] = await Order.aggregate([
  //   {
  //     $match: {
  //       status: {
  //         $in: [ORDER_STATUS.COMPLETED, ORDER_STATUS.WAITING,
  //               ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.READY],
  //       },
  //     },
  //   },
  //   { $group: { _id: null, totalRevenue: { $sum: "$platformFees" } } },
  // ]);
  // const totalRevenue = revenue?.totalRevenue || 0;
};

const editRestaurantsOrUsers = async (req) => {
  const lang = getLanguageFromRequest(req);
  const { entityId, userId, status } = req.body;

  const updateOperations = [];
  let message = "";
  const blockUnblockDate = new Date();
  let statusCode = STATUS_CODES.OK;

  if (entityId) {
    const entity = await EntityDetails.findOne({
      _id: entityId,
      status: { $in: [STATUS.ACTIVE, STATUS.BLOCKED] },
    }).lean();

    if (!entity) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("ADMIN_ENTITY_NOT_FOUND_ERROR", lang),
      });
    }
    updateOperations.push(
      EntityDetails.updateOne(
        { _id: entityId },
        { $set: { status, blockUnblockDate } }
      )
    );

    if (entity.userId) {
      updateOperations.push(
        User.updateOne(
          { _id: entity.userId },
          { $set: { status } } // Set to either ACTIVE or BLOCKED
        )
      );
    }

    statusCode =
      status === STATUS.BLOCKED
        ? STATUS_CODES.NOT_AUTHENTICATED
        : STATUS_CODES.OK;
    io.to(entityId.toString()).emit("restaurantUpdate", {
      status: status,
      statusCode,
    });
  }

  if (userId) {
    const user = await User.findOne({
      _id: userId,
      status: { $in: [STATUS.ACTIVE, STATUS.BLOCKED] },
      role: ROLES.CUSTOMER,
    }).lean();

    if (!user) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("ADMIN_USER_NOT_FOUND_ERROR", lang),
      });
    }

    updateOperations.push(
      User.updateOne({ _id: userId }, { $set: { status, blockUnblockDate } })
    );
    statusCode =
      status === STATUS.BLOCKED
        ? STATUS_CODES.NOT_AUTHENTICATED
        : STATUS_CODES.OK;
    io.to(userId.toString()).emit("restaurantUpdate", {
      status: status,
      statusCode,
    });
  }

  await Promise.all(updateOperations);
  return { statusCode };
};

const resetPassword = async (req) => {
  const lang = getLanguageFromRequest(req);
  const { email, password, authToken } = req.body;

  console.log("=== ADMIN RESET PASSWORD DEBUG ===");
  console.log("Email:", email);
  console.log("AuthToken exists:", !!authToken);
  console.log("Password exists:", !!password);

  let message = "";

  if (authToken && password) {
    const decryptedUserId = decrypt(authToken);
    console.log("Decrypted userId:", decryptedUserId);

    const redisPrefix = KEY_TYPE_PREFIXES.USER_TOKEN;
    const storedToken = await redisClient.get(redisPrefix + decryptedUserId);

    if (!storedToken || storedToken !== authToken) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("ADMIN_SESSION_EXPIRED_ERROR", lang),
      });
    }

    const adminToUpdate = await Admin.findById(decryptedUserId);
    if (!adminToUpdate) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("ADMIN_SESSION_EXPIRED_ERROR", lang),
      });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    adminToUpdate.password = hashedPassword;

    await adminToUpdate.save();

    await redisClient.del(redisPrefix + decryptedUserId);

    return { message: t("ADMIN_PASSWORD_UPDATE_SUCCESS", lang) };
  } else {
    console.log(
      "Looking for admin with email:",
      email,
      "and status:",
      STATUS.ACTIVE
    );
    const adminUser = await Admin.findOne(
      { email, status: STATUS.ACTIVE },
      { email: 1, firstName: 1, lastName: 1, _id: 1 }
    );
    console.log("Admin found:", adminUser);

    if (!adminUser) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("ADMIN_NOT_FOUND_ERROR", lang),
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

    const resetLink = `${process.env.HOST_URL}/admins/reset-password?auth=${authToken}`;
    const mailData = {
      to: email,
      subject: "COUNTR: Reset Password Request",
      html: resetPasswordTemplate(fullName, resetLink),
    };
    createMail(mailData);

    return { message: t("ADMIN_RESET_EMAIL_SENT", lang), emailSent: true };
  }
  return message;
};

const logoutAdmin = async (req) => {
  const lang = getLanguageFromRequest(req);
  const { userId } = req;
  const admin = await Admin.findById(userId, { _id: 1, status: 1 });
  if (admin.status === STATUS.DELETED) {
    throwError({
      status: STATUS_CODES.NOT_AUTHENTICATED,
      message: t("ADMIN_BLOCKED_ERROR", lang),
    });
  }
  const prefix = KEY_TYPE_PREFIXES.USER_TOKEN;
  await redisClient.del(`${prefix}:${admin._id}`);
};

const platformmFees = async (req) => {
  const lang = getLanguageFromRequest(req);
  const {
    userId,
    body: { platformFees },
  } = req;
  const admin = await Admin.findById(userId);
  if (!admin) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("ADMIN_NOT_FOUND_ERROR", lang),
    });
  }
  if (platformFees) admin.platformFees = platformFees;
  await admin.save();
  global.PLATFORM_FEES = platformFees;
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
  platformmFees,
};
