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
const { generatePresignedUrl } = require("../Controller/aws-service");
const { ObjectId } = mongoose.Types;

const createOrder = async (req, session) => {
  const { items, eventId, tableNo, isSelfPickup, note } = req.body;
  const itemsIds = items?.map((doc) => doc.itemId);
  if (!itemsIds) return;
  const menuItems = await ItemDetails.find({ _id: { $in: itemsIds } })
    .populate({
      path: "menuCategoryId",
      // select: "name amount description",
      // model: "CounterMenuCategory",
    })
    .lean();
  console.log({ menuItems });
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
  let counterId;
  let entityId;
  let msg = "";
  const promises = [];
  let amount = 0;
  items.forEach((doc) => {
    const menuItem = itemNameMapper[`${doc.itemId}`];
    console.log({ menuItem: menuItem });
    if (menuItem) {
      entityId = menuItem?.entityId;
      menuCategoryId = menuItem?.menuCategoryId._id;
      counterId = menuItem?.menuCategoryId?.counterId || menuItems?.counterId;
      if (menuItem.availableQuantity < doc.quantity) {
        msg += `${menuItem.itemName} , `;
      }
      // const remainingQuantity = menuItem?.availableQuantity - doc.quantity;
      amount += doc.quantity * menuItem.price;
    }
  });
  // if (remainingQuantity < menuItems.availableQuantity) {
  //   throwError({
  //     status: STATUS_CODES.BAD_REQUEST,
  //     message:
  //       "Apologies! Please enter the less quantity as we are on short of this item for now.",
  //   });
  // }
  // if (msg) {
  //   throwError({
  //     status: STATUS_CODES.BAD_REQUEST,
  //     message: msg + "this items have not valid stocks.",
  //   });
  // }

  const lastOrder = await Order.findOne(
    { entityId },
    { tokenNumber: 1 },
    { sort: { createdAt: -1 } }
  );
  let tokenNumber = 1;
  if (lastOrder) {
    tokenNumber = lastOrder.tokenNumber + 1;
  }
  return Order.create(
    [
      {
        status: ORDER_STATUS.WAITING,
        items,
        counterId,
        entityId,
        tokenNumber,
        userId: req.userId,
        totalAmount: amount,
        eventId,
        tableNo,
        isSelfPickup,
        note,
      },
    ],
    { session }
  );
};

const updateStatusOfOrder = async (req) => {
  const { orderId, status } = req.body;
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
    query: { pageNo = 1, pageLimit = 10, status, counterId },
  } = req;

  const limit = Math.max(Number(pageLimit), 1);
  const skip = (Math.max(Number(pageNo), 1) - 1) * limit;

  const query = { entityId };
  query.status = status
    ? status
    : { $in: [ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.WAITING] };

  if (counterId) {
    query.counterId = counterId;
  }

  const [data, orderProcessCount, readyOrders, completedOrders] =
    await Promise.all([
      Order.find(query)
        .populate({
          path: "items.itemId",
          select: "itemName quantity description type currency image createdAt",
          model: "ItemDetails",
        })
        .populate({
          path: "counterId",
          select: "counterName",
          model: "Counter",
        })
        .sort({ tokenNumber: -1 })
        .skip(skip)
        .limit(limit),
      Order.countDocuments({
        entityId,
        status: { $in: [ORDER_STATUS.WAITING, ORDER_STATUS.IN_PROGRESS] },
      }),
      Order.countDocuments({ entityId, status: ORDER_STATUS.READY }),
      Order.countDocuments({ entityId, status: ORDER_STATUS.COMPLETED }),
    ]);
  console.log({ data });
  return { data, orderProcessCount, readyOrders, completedOrders };
};

const getLiveOrdersUsers = async (req) => {
  const {
    userId,
    query: { searchTerm },
  } = req;

  let searchConditions = [];
  if (searchTerm && searchTerm.trim() !== "") {
    searchConditions = [
      {
        entityId: {
          $in: await EntityDetails.find({
            entityName: { $regex: searchTerm, $options: "i" },
          }).distinct("_id"),
        },
      },
      {
        "items.itemId": {
          $in: await ItemDetails.find({
            itemName: { $regex: searchTerm, $options: "i" },
          }).distinct("_id"),
        },
      },
    ];
  }

  const liveOrders = await Order.find({
    userId,
    status: {
      $in: [
        ORDER_STATUS.WAITING,
        ORDER_STATUS.IN_PROGRESS,
        ORDER_STATUS.READY,
        ORDER_STATUS.COMPLETED,
      ],
    },
    ...(searchConditions.length > 0 ? { $or: searchConditions } : {}),
  })
    .populate({
      path: "items.itemId",
      select: "currency itemId itemName quantity isVegan",
    })
    .populate({
      path: "entityId",
      select: "entityName city image state country",
      model: "EntityDetails",
    })
    .sort({ _id: -1 });

  const updatedLiveOrders = liveOrders.map((order) => {
    if (order.entityId && order.entityId.image) {
      return {
        ...order.toObject(),
        entityId: {
          ...order.entityId.toObject(),
          image: order.entityId.image.includes("X-Amz-Signature")
            ? order.entityId.image
            : generatePresignedUrl(order.entityId.image),
        },
      };
    }
    return order;
  });

  return updatedLiveOrders;
};

const particularOrderDetails = async (req) => {
  const {
    query: { entityId },
    userId,
  } = req;
  const orderDetails = await Order.find({
    userId,
    status: { $in: [ORDER_STATUS.WAITING, ORDER_STATUS.IN_PROGRESS] },
    entityId,
  })
    .populate({
      path: "items.itemId",
      select: "currency itemId itemName quantity type image",
      populate: {
        path: "items.itemId.itemId",
        select: "itemName quantity description type image",
      },
    })
    .sort({ tokenNumber: -1 })
    .lean();

  //Need to change this logic and we should get the price at the time of creating order.
  for (const order of orderDetails) {
    for (const item of order.items) {
      const itemDetail = await ItemDetails.findOne({ _id: item.itemId._id })
        .select("price")
        .lean();

      const itemPrice = itemDetail ? itemDetail.price : 0;
      item.totalPrice = itemPrice * (item.quantity || 1);
    }
  }

  return orderDetails;
};

const particularOrderDetailsCustomer = async (req) => {
  const {
    userId,
    query: { orderId },
  } = req;
  const orderDetails = await Order.findOne(
    {
      userId,
      status: { $in: [ORDER_STATUS.WAITING, ORDER_STATUS.IN_PROGRESS] },
      _id: orderId,
    },
    {
      _id: 1,
      tableNo: 1,
      status: 1,
      items: 1,
      tokenNumber: 1,
      totalAmount: 1,
      isSelfPickup: 1,
      createdAt: 1,
      updatedAt: 1,
      entityId: 1,
      note: 1,
    }
  )
    .populate({
      path: "items.itemId",
      select: "currency itemId itemName quantity isVegan",
    })
    .populate({
      path: "entityId",
      select: "entityName city image",
      model: "EntityDetails",
    })
    .sort({ tokenNumber: -1 })
    .lean();

  if (!orderDetails) {
    throwError({
      status: STATUS_CODES.NOT_FOUND,
      message: "No such Order found",
    });
  }
  if (orderDetails.entityId) {
    orderDetails.entityId.image = generatePresignedUrl(
      orderDetails.entityId.image
    );
  }
  return orderDetails;
};

const getRestaurantOrdersAndCount = async (req) => {
  const {
    userId,
    query: { year },
  } = req;

  const orders = await Order.find(
    {
      userId,
      createdAt: {
        $gte: new Date(`${year}-01-01T00:00:00.000Z`),
        $lt: new Date(`${year}-12-31T23:59:59.999Z`),
      },
    },
    { entityId: 1 }
  );

  if (orders.length === 0) return [];

  const entityOrderCount = orders.reduce((acc, order) => {
    acc[order.entityId] = (acc[order.entityId] || 0) + 1;
    return acc;
  }, {});

  const entityIds = Object.keys(entityOrderCount);
  const entities = await EntityDetails.find(
    { _id: { $in: entityIds } },
    { entityType: 1, entityName: 1, city: 1, state: 1, country: 1, image: 1 }
  ).lean();

  return entities.map((entity) => ({
    entityName: entity.entityName,
    city: entity.city,
    entityId: entity._id,
    state: entity.state,
    country: entity.country,
    image: entity.image ? generatePresignedUrl(entity.image) : "",
    orderCount: entityOrderCount[entity._id],
  }));
};

const getOrderGroupByYears = async (req) => {
  const {
    userId,
    query: { entityId },
  } = req;

  const entityIds = (
    await Order.find({ userId, entityId }, { entityId: 1 }).lean()
  ).map((doc) => doc.entityId);

  let orderFilter = { userId };
  if (entityId) {
    orderFilter.entityId = entityId;
  }

  let allOrders = await Order.find(orderFilter, {
    items: 1,
    tokenNumber: 1,
    updatedAt: 1,
    entityId: 1,
  })
    .populate({
      path: "items.itemId",
      select: "itemName description",
      model: "ItemDetails",
    })
    .lean();

  const entities = await EntityDetails.find(
    { _id: { $in: entityIds } },
    { entityName: 1, entityType: 1 }
  ).lean();

  const entityMapper = {};
  entities.forEach((doc) => {
    entityMapper[`${doc._id}`] = doc;
  });

  allOrders = allOrders.map((doc) => {
    return {
      ...doc,
      year: new Date(doc.updatedAt).getFullYear(),
    };
  });

  const orderMapper = {};
  allOrders.forEach((doc) => {
    if (!orderMapper[doc.year]) {
      orderMapper[doc.year] = {};
    }
    if (!orderMapper[doc.year][doc.entityId]) {
      orderMapper[doc.year][doc.entityId] = {
        entityDetails: entityMapper[doc.entityId],
        orders: [],
      };
    }
    orderMapper[doc.year][doc.entityId].orders.push(doc);
  });

  return orderMapper;
};

const getOrderGroupByMonths = async (req) => {
  const {
    userId,
    query: { year, entityId },
  } = req;

  const entityIds = await Order.distinct("entityId", { userId });

  const entities = await EntityDetails.find(
    { _id: { $in: entityIds } },
    { entityName: 1, entityType: 1 }
  ).lean();

  const entityMapper = Object.fromEntries(
    entities.map((doc) => [doc._id.toString(), doc])
  );

  const ordersByMonthAndEntity = await Order.aggregate([
    {
      $match: {
        userId: ObjectId(userId),
        entityId: ObjectId(entityId),
        createdAt: {
          $gte: new Date(`${year}-01-01T00:00:00.000Z`),
          $lt: new Date(`${year}-12-31T23:59:59.999Z`),
        },
      },
    },
    { $addFields: { month: { $month: "$createdAt" } } },
    {
      $lookup: {
        from: "itemdetails",
        localField: "items.itemId",
        foreignField: "_id",
        as: "itemDetails",
      },
    },
    {
      $addFields: {
        items: {
          $map: {
            input: "$items",
            as: "item",
            in: {
              itemId: {
                _id: "$$item.itemId",
                itemName: {
                  $arrayElemAt: [
                    "$itemDetails.itemName",
                    { $indexOfArray: ["$itemDetails._id", "$$item.itemId"] },
                  ],
                },
              },
              quantity: "$$item.quantity",
            },
          },
        },
      },
    },
    {
      $group: {
        _id: { month: "$month", entityId: "$entityId" },
        orders: {
          $push: {
            _id: "$_id",
            status: "$status",
            tokenNumber: "$tokenNumber",
            items: "$items",
            totalAmount: "$totalAmount",
            createdAt: "$createdAt"
          },
        },
      },
    },
    {
      $group: {
        _id: "$_id.month",
        entities: { $push: { entityId: "$_id.entityId", orders: "$orders" } },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  ordersByMonthAndEntity.forEach((doc) => {
    doc.entities.forEach((entity) => {
      entity.entityDetails = entityMapper[entity.entityId];
      delete entity.entityId;
    });
  });

  return ordersByMonthAndEntity;
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
  return mapper;
};

const pastTicketYears = async (req) => {
  const { userId } = req;
  const orderList = await Order.find(
    { userId },
    { createdAt: 1 },
    { sort: { _id: -1 } }
  );
  const yearList = [];
  orderList.map((orders) => {
    const year = orders.createdAt.getFullYear();
    if (!yearList.includes(year)) {
      yearList.push(year);
    }
  });
  return yearList;
};

const cancelOrder = async (req) => {
  const { orderId } = req.body;
  const order = await Order.findOne({
    _id: orderId,
    status: { $in: [ORDER_STATUS.WAITING, ORDER_STATUS.IN_PROGRESS] },
  });

  if (!order) {
    throwError({
      status: STATUS_CODES.NOT_ACCEPTABLE,
      message: "Order not found",
    });
  }

  if (
    order.status === ORDER_STATUS.READY ||
    order.status === ORDER_STATUS.COMPLETED
  ) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Apologies! order cannot be cancelled now.",
    });
  }
  await Order.updateOne(
    { _id: orderId },
    { $set: { status: ORDER_STATUS.CANCELLED } }
  );
};

module.exports = {
  createOrder,
  updateStatusOfOrder,
  getEntityOrders,
  getOrderGroupByYears,
  getLiveOrdersUsers,
  particularOrderDetails,
  getOrderGroupByYearsForEntity,
  pastTicketYears,
  cancelOrder,
  getOrderGroupByMonths,
  getRestaurantOrdersAndCount,
  particularOrderDetailsCustomer,
};
