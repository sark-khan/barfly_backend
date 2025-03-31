const EntityDetails = require("../Models/EntityDetails");
const Order = require("../Models/Order");
const {
  STATUS_CODES,
  ORDER_STATUS,
  STATUS,
} = require("../Utils/globalConstants");
const throwError = require("../Utils/throwError");
const mongoose = require("mongoose");
const ItemDetails = require("../Models/ItemDetails");
const { generatePresignedUrl } = require("../Controller/aws-service");
const { ObjectId } = mongoose.Types;

const { validateCoupon } = require("../Utils/commonFunction");
const Discount = require("../Models/Discount");
const { messaging, messagingPlus } = require("../firebaseAdmin");
const { io } = require("../app");

const createOrder = async (req, session) => {
  const { items, eventId, tableNo, isSelfPickup, note, couponCode } = req.body;
  const itemsIds = items?.map((doc) => doc.itemId);
  if (!itemsIds) return;

  const menuItems = await ItemDetails.find({ _id: { $in: itemsIds } })
    .populate({ path: "menuCategoryId" })
    .lean();

  if (!menuItems.length) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "No such item exists.",
    });
  }

  const itemNameMapper = {};
  menuItems.forEach((item) => {
    if (item.isOutOfStock) {
      throwError({
        message: `Item ${item.itemName} is out of Stock`,
        status: STATUS_CODES.BAD_REQUEST,
      });
    }
    itemNameMapper[`${item._id}`] = item;
  });

  let counterId;
  let entityId;
  let msg = "";
  let amount = 0;

  items.forEach((doc) => {
    const menuItem = itemNameMapper[`${doc.itemId}`];
    if (menuItem) {
      entityId = menuItem?.entityId;
      // counterId = menuItem?.menuCategoryId?.counterId || menuItems?.counterId;
      counterId = menuItem?.menuCategoryId?.counterId;

      // if (menuItem.availableQuantity < doc.quantity) {
      //   msg += `${menuItem.itemName}, not in stock, Please add less item aur wait for restock.`;
      // }
      amount += doc.quantity * menuItem.price;
    }
  });

  if (msg) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: msg + "these items do not have sufficient stock.",
    });
  }

  const entityDetails = await EntityDetails.findOne({
    _id: entityId,
  }).populate("owner").lean();
  if (entityDetails && !entityDetails.isOpen) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Restaurant is currently closed. Orders cannot be placed.",
    });
  }

  const lastOrder = await Order.find(
    { entityId },
    { tokenNumber: 1 },
    { sort: { _id: -1 } }
  ).limit(1);
  let tokenNumber = lastOrder[0] ? lastOrder[0].tokenNumber + 1 : 1;

  const originalAmount = amount;
  let discountAmount = 0;

  if (couponCode) {
    const couponValidation = await validateCoupon(couponCode, originalAmount);
    discountAmount = couponValidation.discountAmount;
  }

  const finalAmount = originalAmount - discountAmount + 2.25;

  const orderData = {
    status: ORDER_STATUS.WAITING,
    items,
    counterId,
    entityId,
    tokenNumber,
    userId: req.userId,
    totalAmount: originalAmount,
    discountAmount,
    finalAmount,
    couponCode,
    eventId,
    tableNo,
    isSelfPickup,
    note,
  };

  // if (tableNo) {
  //   await Counter.findOneAndUpdate(
  //     { _id: counterId, tableNo },
  //     { $set: { tableStatus: TABLE_STATUS.OCCUPIED } }
  //   );
  // }

  const createdOrder = await Order.create([orderData], { session })
  console.log({createdOrder});
  if (couponCode) {
    await Discount.updateOne({ code: couponCode }, { $inc: { usedCount: 1 } });
  }``

  io.to(entityId.toString()).emit("newOrder", createdOrder);
  // console.log({ss:entityDetails.owner})
  const payload = {
    notification: {
      title: "Order Created",
      body: `New Order Received. Tap to view details.`,
    },
    data: {
      orderId: `${createdOrder[0]._id}`,
      data:JSON.stringify(createdOrder[0]),
      // status: status,
      screen: "landing_home",
      click_action: "FLUTTER_NOTIFICATION_CLICK",
    },
    token: entityDetails.owner.fcmToken,
    android: {
      priority: "high",
      notification: {
        click_action: "FLUTTER_NOTIFICATION_CLICK",
      },
    },
    apns: {
      payload: {
        aps: {
          content_available: true,
          category: "FLUTTER_NOTIFICATION_CLICK",
          mutableContent: 1,
          alert: {
            title: "Order Created ",
            body: `Your order is now created. Tap to view details.`,
          },
        },
      },
    },
  };

  console.log({payload});
  await messagingPlus.send(payload);

  return createdOrder;
};

const updateStatusOfOrder = async (req) => {
  const { orderId, status } = req.body;
  if (
    status !== ORDER_STATUS.COMPLETED &&
    status !== ORDER_STATUS.READY &&
    status !== ORDER_STATUS.IN_PROGRESS &&
    status !== ORDER_STATUS.CANCELLED
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
  const updatedOrder = await Order.findOneAndUpdate(
    { _id: orderId },
    { $set: { status } },
    { new: true }
  ).populate("userId");
  const payload = {
    notification: {
      title: "Order Status Updated",
      body: `Your order is now ${status}. Tap to view details.`,
    },
    data: {
      orderId: orderId,
      status: status,
      screen: "status",
      click_action: "FLUTTER_NOTIFICATION_CLICK",
    },
    token: updatedOrder.userId.fcmToken,
    android: {
      priority: "high",
      notification: {
        click_action: "FLUTTER_NOTIFICATION_CLICK",
      },
    },
    apns: {
      payload: {
        aps: {
          content_available: true,
          category: "FLUTTER_NOTIFICATION_CLICK",
          mutableContent: 1,
          alert: {
            title: "Order Status Updated",
            body: `Your order is now ${status}. Tap to view details.`,
          },
        },
      },
    },
  };

  await messaging.send(payload);

  console.log(`Push notification sent to user ${req.userId}`);
};

// const getEntityOrders = async (req) => {
//   const {
//     entityId,
//     query: { pageNo = 1, pageLimit = 10, status, counterId },
//   } = req;

//   const limit = Math.max(Number(pageLimit), 1);
//   const skip = (Math.max(Number(pageNo), 1) - 1) * limit;

//   const query = { entityId };
//   query.status = status
//     ? status
//     : {
//         $in: [
//           ORDER_STATUS.IN_PROGRESS,
//           ORDER_STATUS.WAITING,
//           ORDER_STATUS.CANCELLED,
//         ],
//       };

//   if (counterId) {
//     query.counterId = counterId;
//   }

//   const [
//     data,
//     orderProcessCount,
//     readyOrders,
//     completedOrders,
//     cancelledOrders,
//   ] = await Promise.all([
//     Order.find(query)
//       .populate({
//         path: "items.itemId",
//         select: "itemName quantity description type currency image createdAt",
//         model: "ItemDetails",
//       })
//       .populate({
//         path: "counterId",
//         select: "counterName",
//         model: "Counter",
//       })
//       .sort({ tokenNumber: -1 })
//       .skip(skip)
//       .limit(limit),
//     Order.countDocuments({
//       entityId,
//       status: {
//         $in: [ORDER_STATUS.WAITING, ORDER_STATUS.IN_PROGRESS],
//       },
//     }),
//     Order.countDocuments({ entityId, status: ORDER_STATUS.READY }),
//     Order.countDocuments({ entityId, status: ORDER_STATUS.COMPLETED }),
//     Order.countDocuments({ entityId, status: ORDER_STATUS.CANCELLED }),
//   ]);
//   return {
//     data,
//     orderProcessCount,
//     readyOrders,
//     completedOrders,
//     cancelledOrders,
//   };
// };

const getEntityOrders = async (req) => {
  const {
    entityId,
    query: { pageNo = 1, pageLimit = 10, status, counterId, searchTerm },
  } = req;

  const limit = Math.max(Number(pageLimit), 1);
  const skip = (Math.max(Number(pageNo), 1) - 1) * limit;

  const query = { entityId };

  query.status = status
    ? status
    : {
        $in: [ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.WAITING],
      };

  if (counterId) {
    query.counterId = counterId;
  }

  if (searchTerm) {
    const searchRegex = new RegExp(searchTerm, "i");
    const searchConditions = [];

    if (mongoose.Types.ObjectId.isValid(searchTerm)) {
      searchConditions.push({ _id: new mongoose.Types.ObjectId(searchTerm) });
    }

    const matchingItems = await ItemDetails.find(
      { itemName: { $regex: searchRegex } },
      { _id: 1 }
    ).lean();

    if (matchingItems.length > 0) {
      const matchingItemIds = matchingItems.map((item) => item._id);
      searchConditions.push({ "items.itemId": { $in: matchingItemIds } });
    }

    if (searchConditions.length > 0) {
      query.$or = searchConditions;
    }
  }
  console.log({ ...query });

  const data = await Order.find(query)
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
    .limit(limit);

  delete query.status;
  console.log({ query });
  const [orderProcessCount, readyOrders, completedOrders, cancelledOrders] =
    await Promise.all([
      Order.countDocuments({
        ...query,
        status: {
          $in: [ORDER_STATUS.WAITING, ORDER_STATUS.IN_PROGRESS],
        },
      }),
      Order.countDocuments({ ...query, status: ORDER_STATUS.READY }),
      Order.countDocuments({ ...query, status: ORDER_STATUS.COMPLETED }),
      Order.countDocuments({ ...query, status: ORDER_STATUS.CANCELLED }),
    ]);

  return {
    data,
    orderProcessCount,
    readyOrders,
    completedOrders,
    cancelledOrders,
  };
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
      $in: [ORDER_STATUS.WAITING, ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.READY],
    },
    ...(searchConditions.length > 0 ? { $or: searchConditions } : {}),
  })
    .populate({
      path: "items.itemId",
      select: "currency itemId itemName quantity isVegan price",
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
        finalAmount: order.finalAmount,
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

  for (const order of orderDetails) {
    for (const item of order.items) {
      const itemDetail = await ItemDetails.findOne({ _id: item.itemId._id })
        .select("price")
        .lean();

      const itemPrice = itemDetail ? itemDetail.price : 0;
      item.totalPrice = itemPrice * (item.quantity || 1);
    }
    order.finalAmount = order.finalAmount;
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
      status: {
        $in: [
          ORDER_STATUS.WAITING,
          ORDER_STATUS.IN_PROGRESS,
          ORDER_STATUS.READY,
          ORDER_STATUS.COMPLETED,
        ],
      },
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
      finalAmount: 1,
      discountAmount: 1,
    }
  )
    .populate({
      path: "items.itemId",
      select: "currency itemId itemName quantity isVegan price",
      model: "ItemDetails",
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
  if (orderDetails.entityId && orderDetails.entityId.image) {
    orderDetails.entityId.image = generatePresignedUrl(
      orderDetails.entityId.image
    );
    orderDetails.finalAmount = orderDetails.finalAmount;
  }
  return orderDetails;
};

const getRestaurantOrdersAndCount = async (req) => {
  const {
    userId,
    query: { year, searchTerm },
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

  const searchQuery = {
    _id: { $in: entityIds },
  };
  if (searchTerm) {
    searchQuery.entityName = { $regex: searchTerm, $options: "i" }; // Case-insensitive search
  }

  const entities = await EntityDetails.find(searchQuery, {
    entityType: 1,
    entityName: 1,
    city: 1,
    state: 1,
    country: 1,
    image: 1,
  }).lean();

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
            createdAt: "$createdAt",
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
    { items: 1, tokenNumber: 1, updatedAt: 1, status: 1 }
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
    [
      ORDER_STATUS.READY,
      ORDER_STATUS.COMPLETED,
      ORDER_STATUS.CANCELLED,
    ].includes(order.status)
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

  io.to(order.entityId.toString()).emit("cancelOrder", {
    orderId: order._id,
    status: ORDER_STATUS.CANCELLED,
  });
};

const getEventOrderSummary = async (req) => {
  const { eventId, counterId } = req.query;

  const query = { eventId };
  if (counterId) {
    query.counterId = counterId;
  }

  const orders = await Order.find(query)
    .populate({
      path: "counterId",
      select: "counterName status isTableService isSelfPickUp",
      model: "Counter",
    })
    .populate({
      path: "items.itemId",
      select: "itemName price",
      model: "ItemDetails",
    })
    .lean();

  const counterSummary = {};
  let totalOrders = 0;
  let totalAmount = 0;

  const orderDetails = orders
    .filter((order) => order.counterId?.status === STATUS.ACTIVE)
    .map((order) => {
      const {
        counterId,
        finalAmount,
        tokenNumber,
        items,
        tableNo,
        status,
        isSelfPickup,
        createdAt,
      } = order;

      if (!counterId) return null;

      const counterKey = counterId._id.toString();
      const counterName = counterId.counterName;
      const counterTableService = counterId.isTableService;
      const counterSelfPickup = counterId.isSelfPickUp;

      if (!counterSummary[counterKey]) {
        counterSummary[counterKey] = {
          counterName,
          totalOrders: 0,
          totalAmount: 0,
        };
      }

      counterSummary[counterKey].totalOrders += 1;
      counterSummary[counterKey].totalAmount += finalAmount;

      totalOrders += 1;
      totalAmount += finalAmount;

      return {
        orderId: order._id,
        tokenNumber,
        finalAmount,
        counterId: counterKey,
        counterName,
        tableNo,
        status,
        isSelfPickUp: counterSelfPickup,
        isTableService: counterTableService,
        isSelfPickup,
        currency: "CHF",
        createdAt,
        items: items.map((item) => ({
          itemId: item.itemId?._id,
          itemName: item.itemId?.itemName,
          price: item.itemId?.price,
          quantity: item.quantity,
          totalPrice: item.quantity * item.itemId?.price,
        })),
      };
    })
    .filter(Boolean);

  const counters = Object.entries(counterSummary).map(([counterId, data]) => ({
    counterId,
    counterName: data.counterName,
    totalOrders: data.totalOrders,
    totalAmount: data.totalAmount,
  }));

  const result = {
    eventId,
    totalOrders,
    totalAmount,
    counters,
    orders: counterId ? orderDetails : [],
  };

  return result;
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
  getEventOrderSummary,
};
