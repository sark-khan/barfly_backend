const MenuItem = require("../Models/MenuItem");
const EntityDetails = require("../Models/EntityDetails");
const Counter = require("../Models/Counter");
const Order = require("../Models/Order");
const {
  STATUS_CODES,
  ORDER_STATUS,
  ROLES,
} = require("../Utils/globalConstants");
const throwError = require("../Utils/throwError");
const mongoose = require("mongoose");
const ItemDetails = require("../Models/ItemDetails");

const createOrder = async (req, session) => {
  const { items } = req.body;
  const itemsIds = items?.map((doc) => doc.itemId);
  if (!itemsIds) return;
  const menuItems = await MenuItem.find({ _id: { $in: itemsIds } })
    .populate({
      path: "menuCategoryId",
    })
    .lean();
  if (!menuItems.length) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "No Such Item exists.",
    });
  }
  const itemNameMapper = {};
  menuItems.forEach((item) => {
    itemNameMapper[`${item._id}`] = item;
  });
  let menuCategoryId;
  let counterId;
  let entityId;
  let msg = "";
  const promises = [];
  items.forEach((doc) => {
    const menuItem = itemNameMapper[`${doc.itemId}`];
    if (menuItem) {
      entityId = menuItem?.menuCategoryId?.entityId;
      menuCategoryId = menuItem?.menuCategoryId._id;
      counterId = menuItem?.menuCategoryId?.counterId;
      if (menuItem.availableQuantity < doc.quantity) {
        msg += `${menuItem.itemName} , `;
      }
      const remainingQuantity = menuItem?.availableQuantity - doc.quantity;
      promises.push(
        MenuItem.findOneAndUpdate(
          { _id: doc.itemId },
          { $set: { availableQuantity: remainingQuantity } },
          { session }
        )
      );
    }
  });
  if (msg) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: msg + "this items have not valid stocks.",
    });
  }
  const lastOrder = await Order.findOne(
    { entityId },
    { tokenNumber: 1 },
    { sort: { createdAt: -1 } }
  );
  console.log({ lastOrder });
  let tokenNumber = 1;
  if (lastOrder) {
    tokenNumber = lastOrder.tokenNumber + 1;
  }
  await Promise.all(promises);
  return Order.create(
    [
      {
        status: ORDER_STATUS.WAITING,
        items,
        counterId,
        entityId,
        tokenNumber,
        userId: req.id,
      },
    ],
    { session }
  );
};

const updateStatusOfOrder = async (req) => {
  const { orderId, status } = req.body;
  console.log({ orderId, status });
  if (
    status !== ORDER_STATUS.COMPLETED &&
    status !== ORDER_STATUS.READY &&
    status !== ORDER_STATUS.IN_PROGRESS
  ) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Not a valid status.",
    });
  }
  const order = await Order.exists({ _id: orderId });
  if (!order) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "No Such order exist.",
    });
  }
  return Order.findOneAndUpdate({ _id: orderId }, { $set: { status } });
};

const getEntityOrders = async (req) => {
  const {
    entityId,
    body: { status, pageNo = 1, pageLimit = 10 },
  } = req;
  const query = {};
  if (req.role == ROLES.CUSTOMER) {
    query.userId = req.id;
  } else {
    query.entityId = entityId;
  }
  if (status) {
    query.status = status;
  }
  const skip = +(pageNo - 1) * +pageLimit;
  const [data, totalCount] = await Promise.all([
    Order.find(query, { items: 1, status: 1, tokenNumber: 1 })
      .populate({
        path: "items.itemId",
        select: "itemName quantity description type currency image",
      })
      .sort({ tokenNumber: -1 })
      .skip(skip)
      .limit(pageLimit),
    Order.countDocuments(query),
  ]);
  return { data, totalCount };
};

const getLiveOrdersUsers = async (req) => {
  const userId = req.id;
  const liveOrders = await Order.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        status: { $in: [ORDER_STATUS.WAITING, ORDER_STATUS.IN_PROGRESS] },
      },
    },
    {
      $lookup: {
        from: "entitydetails",
        localField: "entityId",
        foreignField: "_id",
        as: "entityDetails",
      },
    },
    {
      $unwind: {
        path: "$entityDetails",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $group: {
        _id: "$entityId", // Group by `entityId`
        entityDetails: { $first: "$entityDetails" }, // Take the first occurrence of entityDetails for each group
        orders: {
          $push: {
            _id: "$_id",
            status: "$status",
            items: "$items",
            tokenNumber: "$tokenNumber",
            updatedAt: "$updatedAt",
          },
        },
        orderCount: { $sum: 1 }, // Count the number of orders in each group
      },
    },
    {
      $project: {
        _id: 1,
        entityDetails: 1, // Include `entityDetails` (contains entityName, etc.)
        orders: 1, // Include the grouped orders
        orderCount: 1, // Include the order count
      },
    },
    {
      $limit: 5, // Optional: Limit the results for inspection
    },
  ]);
  return liveOrders;
};

const particularOrderDetails = async (req) => {
  const { entityId } = req.query;
  const orderDetails = await Order.find(
    {
      userId: req.id,
      status: { $in: [ORDER_STATUS.WAITING, ORDER_STATUS.IN_PROGRESS] },
      entityId,
    },
    null,
    { lean: 1, sort: { tokenNumber: -1 } }
  ).populate({
    path: "items.itemId", // Path to the field in the items array to populate
    select: "itemName description type currency image", // Optional: specify the fields you want to include
  });
  return orderDetails;
};

const getOrderGroupByYears = async (req) => {
  const userId = req.id;
  const menuItemsIds = [];
  const entityIds = [];
  let allOrders = await Order.find(
    { userId },
    { entityId: 1, items: 1, tokenNumber: 1, updatedAt: 1 }
  ).lean();
  allOrders.forEach((doc) => {
    entityIds.push(doc.entityId);
    doc.items.forEach((item) => {
      menuItemsIds.push(item.itemId);
    });
  });
  const entities = await EntityDetails.find(
    { _id: { $in: entityIds } },
    { entityName: 1, entityType: 1 }
  ).lean();
  const entityMapper = {};
  entities.forEach((doc) => {
    entityMapper[`${doc._id}`] = doc;
  });
  const allItemDetails = await ItemDetails.find({ _id: menuItemsIds })
    .populate({
      path: "itemId",
    })
    .lean();
  console.log({ allItemDetails });
  const itemDetailsMapper = {};
  allItemDetails.forEach((doc) => {
    itemDetailsMapper[`${doc._id}`] = {
      price: doc.price,
      currency: doc.currency,
      itemName: doc.itemId.itemName,
      image: doc.itemId.image,
      type: doc.itemId.type,
      description: doc.itemId.description,
      quantityLable: doc.itemId.quantity,
    };
  });
  allOrders = allOrders.map((doc) => {
    const data = { ...doc };
    data.items = doc.items.map((item) => {
      return { quantity: item.quantity, ...itemDetailsMapper[item.itemId] };
    });
    data.year = new Date(doc.updatedAt).getFullYear();
    return data;
  });

  const mapper = {};
  allOrders.forEach((doc) => {
    if (!mapper[doc.year]) {
      mapper[doc.year] = {};
    }
    if (!mapper[doc.year][doc.entityId._id]) {
      mapper[doc.year][doc.entityId._id] = {
        entityDetails: entityMapper[doc.entityId._id],
        orders: [],
      };
    }
    mapper[doc.year][doc.entityId._id].orders.push(doc);
  });
  console.log({ mapper });
  return mapper;
};
const getOrderGroupByYearsForEntity = async (req) => {
  let { entityId } = req;
  if (req.query.entityId) {
    entityId = req.body.entityId;
  }
  const menuItemsIds = [];
  const entityIds = [];
  let allOrders = await Order.find(
    { entityId },
    { items: 1, tokenNumber: 1, updatedAt: 1 }
  ).lean();
  allOrders.forEach((doc) => {
    doc.items.forEach((item) => {
      menuItemsIds.push(item.itemId);
    });
  });
  const allItemDetails = await ItemDetails.find({ _id: menuItemsIds })
    .populate({
      path: "itemId",
    })
    .lean();
  console.log({ allItemDetails });
  const itemDetailsMapper = {};
  allItemDetails.forEach((doc) => {
    itemDetailsMapper[`${doc._id}`] = {
      price: doc.price,
      currency: doc.currency,
      itemName: doc.itemId.itemName,
      image: doc.itemId.image,
      type: doc.itemId.type,
      description: doc.itemId.description,
      quantityLable: doc.itemId.quantity,
    };
  });
  allOrders = allOrders.map((doc) => {
    const data = { ...doc };
    data.items = doc.items.map((item) => {
      return { quantity: item.quantity, ...itemDetailsMapper[item.itemId] };
    });
    data.year = new Date(doc.updatedAt).getFullYear();
    return data;
  });

  const mapper = {};
  allOrders.forEach((doc) => {
    if (!mapper[doc.year]) {
      mapper[doc.year] = { orders: [] };
    }
    mapper[doc.year].orders.push(doc);
  });
  console.log({ mapper });
  return mapper;
};
module.exports = {
  createOrder,
  updateStatusOfOrder,
  getEntityOrders,
  getOrderGroupByYears,
  getLiveOrdersUsers,
  particularOrderDetails,
  getOrderGroupByYearsForEntity,
};
