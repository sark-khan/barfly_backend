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
  const { items, eventId } = req.body;
  const itemsIds = items?.map((doc) => doc.itemId);
  console.log({ itemsIds });
  if (!itemsIds) return;
  const menuItems = await ItemDetails.find({ itemId: { $in: itemsIds } })
    .populate({
      path: "menuCategoryId",
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
    itemNameMapper[`${item.itemId}`] = item;
  });
  console.log({ itemNameMapper });
  let counterId;
  let entityId;
  let msg = "";
  const promises = [];
  let amount = 0;
  items.forEach((doc) => {
    console.log({ doc })
    const menuItem = itemNameMapper[`${doc.itemId}`];
    if (menuItem) {

      console.log("Reched ehr er")
      entityId = menuItem?.menuCategoryId?.entityId;
      console.log({ mm: menuItem });
      console.log({ mm: menuItem.menuCategoryId })
      menuCategoryId = menuItem?.menuCategoryId._id;
      counterId = menuItem?.menuCategoryId?.counterId;
      if (menuItem.availableQuantity < doc.quantity) {
        msg += `${menuItem.itemName} , `;
      }
      const remainingQuantity = menuItem?.availableQuantity - doc.quantity;
      amount += +doc.quantity * +menuItem.price;
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
  let tokenNumber = 1;
  if (lastOrder) {
    tokenNumber = lastOrder.tokenNumber + 1;
  }
  // await Promise.all(promises);
  console.log({ counterId });
  return Order.create(
    [
      {
        status: ORDER_STATUS.WAITING,
        items,
        counterId,
        entityId,
        tokenNumber,
        userId: req.id,
        totalAmount: amount,
        eventId,
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
  if (!req.isAdmin) {
    if (req.role == ROLES.CUSTOMER) {
      query.userId = req.id;
    } else {
      query.entityId = entityId;
    }
    if (status) {
      query.status = status;
    }
  } else {
    if (req.body.entityId) {
      query.entityId = req.body.entityId;
    }
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
  const {
    userId,
    query: { pageNo = 1, pageLimit = 10 },
  } = req;
  const skip = +(pageNo - 1) * +pageLimit;
  let liveOrders = await Order.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        status: { $in: [ORDER_STATUS.WAITING, ORDER_STATUS.IN_PROGRESS] },
      },
    },
    {
      $sort: { updatedAt: -1 },
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
        latestUpdatedAt: { $first: "$updatedAt" },
        orderCount: { $sum: 1 }, // Count the number of orders in each group
      },
    },
    {
      $addFields: {
        orders: {
          $sortArray: {
            input: "$orders",
            sortBy: { tokenNumber: -1 },
          },
        },
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
      $sort: { latestUpdatedAt: -1 },
    },
  ]);
  return liveOrders;
};

const particularOrderDetails = async (req) => {
  const {
    query: { entityId },
    userId,
  } = req;
  console.log({ userId, entityId, token: req.headers.token }
  )
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
  console.log({ order: orderDetails[0].items })
  return orderDetails;
};

// const getOrderGroupByYears = async (req) => {
//     const userId = req.id;
//     const entityIds = (await Order.find({ userId }, { entityId: 1 }).lean()).map(
//         (doc) => doc.entityId
//     );
//     const entities = await EntityDetails.find(
//         { _id: { $in: entityIds } },
//         { entityName: 1, entityType: 1 }
//     ).lean();
//     const entityMapper = {};
//     entities.forEach((doc) => {
//         entityMapper[`${doc._id}`] = doc;
//     });
//     const ordersByYearAndEntity = await Order.aggregate([
//         {
//             // Stage 1: Match documents by userId
//             $match: {
//                 userId: new mongoose.Types.ObjectId(userId),
//             },
//         },
//         {
//             // Stage 2: Add a field for the year based on the order's creation date
//             $addFields: {
//                 year: { $year: "$createdAt" },
//             },
//         },
//         {
//             // Stage 3: Lookup the itemId to join with the MenuItem collection to get itemDetails
//             $lookup: {
//                 from: "menuitems", // Replace with the actual collection name for MenuItem
//                 localField: "items.itemId",
//                 foreignField: "_id",
//                 as: "itemDetails",
//             },
//         },
//         {
//             // Stage 4: Add entityId to each item and project specific fields from itemDetails
//             $addFields: {
//                 items: {
//                     $map: {
//                         input: "$items",
//                         as: "item",
//                         in: {
//                             _id: "$$item._id",
//                             itemId: "$$item.itemId",
//                             quantity: "$$item.quantity",
//                             itemDetails: {
//                                 $arrayElemAt: [
//                                     {
//                                         $filter: {
//                                             input: "$itemDetails",
//                                             as: "detail",
//                                             cond: { $eq: ["$$detail._id", "$$item.itemId"] },
//                                         },
//                                     },
//                                     0,
//                                 ],
//                             },
//                         },
//                     },
//                 },
//             },
//         },
//         {
//             // Stage 5: Project specific fields from itemDetails into items
//             $addFields: {
//                 items: {
//                     $map: {
//                         input: "$items",
//                         as: "item",
//                         in: {
//                             _id: "$$item._id",
//                             itemId: "$$item.itemId",
//                             quantity: "$$item.quantity",
//                             itemDetails: {
//                                 _id: "$$item.itemDetails._id",
//                                 itemName: "$$item.itemDetails.itemName",
//                                 description: "$$item.itemDetails.description",
//                                 type: "$$item.itemDetails.type",
//                                 currency: "$$item.itemDetails.currency",
//                                 image: "$$item.itemDetails.image",
//                                 entityId: "$$item.itemDetails.entityId", // Ensure entityId is added to itemDetails
//                             },
//                         },
//                     },
//                 },
//             },
//         },
//         {
//             // Stage 6: Group by year and entityId, accumulating orders
//             $group: {
//                 _id: {
//                     year: "$year",
//                     entityId: "$entityId", // Include entityId in the group
//                 },
//                 orders: {
//                     $push: {
//                         _id: "$_id",
//                         status: "$status",
//                         tokenNumber: "$tokenNumber",
//                         items: "$items",
//                         entityId: "$entityId", // Include entityId in the order
//                     },
//                 },
//             },
//         },
//         {
//             // Stage 7: Ensure orders are sorted by tokenNumber in descending order
//             $addFields: {
//                 orders: {
//                     $map: {
//                         input: "$orders",
//                         as: "order",
//                         in: {
//                             _id: "$$order._id",
//                             status: "$$order.status",
//                             tokenNumber: "$$order.tokenNumber",
//                             items: {
//                                 $map: {
//                                     input: "$$order.items",
//                                     as: "item",
//                                     in: {
//                                         _id: "$$item._id",
//                                         itemId: "$$item.itemId",
//                                         quantity: "$$item.quantity",
//                                         entityId: "$$item.entityId", // Access entityId from itemDetails
//                                         itemDetails: {
//                                             _id: "$$item.itemDetails._id",
//                                             itemName: "$$item.itemDetails.itemName",
//                                             description: "$$item.itemDetails.description",
//                                             type: "$$item.itemDetails.type",
//                                             currency: "$$item.itemDetails.currency",
//                                             image: "$$item.itemDetails.image",
//                                             entityId: "$$item.itemDetails.entityId",
//                                         },
//                                     },
//                                 },
//                             },
//                             entityId: "$$order.entityId", // Include entityId in the order
//                         },
//                     },
//                 },
//             },
//         },
//         {
//             // Stage 8: Group by year and accumulate entities
//             $group: {
//                 _id: "$_id.year",
//                 entities: {
//                     $push: {
//                         entityId: "$_id.entityId",
//                         orders: "$orders",
//                     },
//                 },
//             },
//         },
//         {
//             // Stage 9: Sort by year in descending order
//             $sort: { _id: -1 },
//         },
//     ]);
//     ordersByYearAndEntity.forEach((doc) => {
//         if (doc.entities?.length) {
//             doc.entities.forEach((entity) => {
//                 entity.entityDetails = entityMapper[entity.entityId];
//                 delete entity.entityId;
//             });
//         }
//     });
//     return ordersByYearAndEntity;
// };

const getOrderGroupByYears = async (req) => {
  const { userId } = req;
  const entityIds = (await Order.find({ userId }, { entityId: 1 }).lean()).map(
    (doc) => doc.entityId
  );
  const entities = await EntityDetails.find(
    { _id: { $in: entityIds } },
    { entityName: 1, entityType: 1 }
  ).lean();
  const entityMapper = {};
  entities.forEach((doc) => {
    entityMapper[`${doc._id}`] = doc;
  });
  const ordersByYearAndEntity = await Order.aggregate([
    {
      // Stage 1: Match documents by userId
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
      },
    },
    {
      // Stage 2: Add a field for the year based on the order's creation date
      $addFields: {
        year: { $year: "$createdAt" },
      },
    },
    {
      // Stage 3: Lookup the itemId to join with the MenuItem collection to get itemDetails
      $lookup: {
        from: "itemdetails", // Replace with the actual collection name for MenuItem
        localField: "items.itemId",
        foreignField: "_id",
        as: "itemDetails",
      },
    },
    {
      // Stage 4: Add entityId to each item and project specific fields from itemDetails
      $addFields: {
        items: {
          $map: {
            input: "$items",
            as: "item",
            in: {
              _id: "$$item._id",
              itemId: "$$item.itemId",
              quantity: "$$item.quantity",
              itemDetails: {
                $arrayElemAt: [
                  {
                    $filter: {
                      input: "$itemDetails",
                      as: "detail",
                      cond: { $eq: ["$$detail._id", "$$item.itemId"] },
                    },
                  },
                  0,
                ],
              },
            },
          },
        },
      },
    },
    {
      // Stage 5: Project specific fields from itemDetails into items
      $addFields: {
        items: {
          $map: {
            input: "$items",
            as: "item",
            in: {
              _id: "$$item._id",
              itemId: "$$item.itemId",
              quantity: "$$item.quantity",
              itemDetails: {
                _id: "$$item.itemDetails._id",
                itemName: "$$item.itemDetails.itemName",
                description: "$$item.itemDetails.description",
                type: "$$item.itemDetails.type",
                currency: "$$item.itemDetails.currency",
                image: "$$item.itemDetails.image",
                entityId: "$$item.itemDetails.entityId", // Ensure entityId is added to itemDetails
              },
            },
          },
        },
      },
    },
    {
      // Stage 6: Group by year and entityId, accumulating orders
      $group: {
        _id: {
          year: "$year",
          entityId: "$entityId", // Include entityId in the group
        },
        orders: {
          $push: {
            _id: "$_id",
            status: "$status",
            tokenNumber: "$tokenNumber",
            items: "$items",
            entityId: "$entityId", // Include entityId in the order
          },
        },
      },
    },
    {
      // Stage 7: Ensure orders are sorted by tokenNumber in descending order
      $addFields: {
        orders: {
          $map: {
            input: "$orders",
            as: "order",
            in: {
              _id: "$$order._id",
              status: "$$order.status",
              tokenNumber: "$$order.tokenNumber",
              items: {
                $map: {
                  input: "$$order.items",
                  as: "item",
                  in: {
                    _id: "$$item._id",
                    itemId: "$$item.itemId",
                    quantity: "$$item.quantity",
                    entityId: "$$item.entityId", // Access entityId from itemDetails
                    itemDetails: {
                      _id: "$$item.itemDetails._id",
                      itemName: "$$item.itemDetails.itemName",
                      description: "$$item.itemDetails.description",
                      type: "$$item.itemDetails.type",
                      currency: "$$item.itemDetails.currency",
                      image: "$$item.itemDetails.image",
                      entityId: "$$item.itemDetails.entityId",
                    },
                  },
                },
              },
              entityId: "$$order.entityId", // Include entityId in the order
            },
          },
        },
      },
    },
    {
      // Stage 8: Group by year and accumulate entities
      $group: {
        _id: "$_id.year",
        entities: {
          $push: {
            entityId: "$_id.entityId",
            orders: "$orders",
          },
        },
      },
    },
    {
      // Stage 9: Sort by year in descending order
      $sort: { _id: -1 },
    },
  ]);
  ordersByYearAndEntity.forEach((doc) => {
    if (doc.entities?.length) {
      doc.entities.forEach((entity) => {
        entity.entityDetails = entityMapper[entity.entityId];
        delete entity.entityId;
      });
    }
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
  return mapper;
};

const pastTicketYears = async (req) => {
  const { userId } = req;
  const orderList = await Order.find({ userId }, { createdAt: 1 }, { sort: { _id: -1 } });
  const yearList = []
  orderList.map((orders) => {
    const year = orders.createdAt.getFullYear()
    if (!yearList.includes(year)) {
      yearList.push(year);
    }
  })
  return yearList;
}
module.exports = {
  createOrder,
  updateStatusOfOrder,
  getEntityOrders,
  getOrderGroupByYears,
  getLiveOrdersUsers,
  particularOrderDetails,
  getOrderGroupByYearsForEntity,
  pastTicketYears
};
