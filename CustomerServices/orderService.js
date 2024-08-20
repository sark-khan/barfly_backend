const MenuItem = require("../Models/MenuItem");
const EntityDetails = require("../Models/EntityDetails")
const Counter = require("../Models/Counter")
const Order = require("../Models/Order")
const { STATUS_CODES, ORDER_STATUS, ROLES } = require("../Utils/globalConstants");
const throwError = require("../Utils/throwError");
const mongoose = require("mongoose");

const createOrder = async (req, session) => {
    const { items } = req.body;
    const itemsIds = items?.map(doc => doc.itemId);
    if (!itemsIds) return;
    const menuItems = await MenuItem.find({ _id: { $in: itemsIds } })
        .populate({
            path: 'menuCategoryId',
        }).lean();
    if (!menuItems.length) {
        throwError({ status: STATUS_CODES.BAD_REQUEST, message: "No Such Item exists." })
    }
    const itemNameMapper = {};
    menuItems.forEach(item => {
        itemNameMapper[`${item._id}`] = item;
    })
    let menuCategoryId;
    let counterId;
    let entityId;
    let msg = ""
    const promises = []
    let amount = 0;
    items.forEach(doc => {
        const menuItem = itemNameMapper[`${doc.itemId}`]
        if (menuItem) {
            entityId = menuItem?.menuCategoryId?.entityId;
            menuCategoryId = menuItem?.menuCategoryId._id;
            counterId = menuItem?.menuCategoryId?.counterId;
            if (menuItem.availableQuantity < doc.quantity) {
                msg += `${menuItem.itemName} , `;
            }
            const remainingQuantity = menuItem?.availableQuantity - doc.quantity;
            amount += (+doc.quantity * +menuItem.price)

            promises.push(MenuItem.findOneAndUpdate({ _id: doc.itemId }, { $set: { availableQuantity: remainingQuantity } }, { session }));
        }
    })
    if (msg) {
        throwError({ status: STATUS_CODES.BAD_REQUEST, message: msg + "this items have not valid stocks." })
    }
    const lastOrder = await Order.findOne({ entityId }, { tokenNumber: 1 }, { sort: { createdAt: -1 } });
    console.log({ lastOrder })
    let tokenNumber = 1;
    if (lastOrder) {
        tokenNumber = lastOrder.tokenNumber + 1;
    }
    await Promise.all(promises);
    return Order.create([{
        status: ORDER_STATUS.WAITING,
        items,
        menuCategoryId,
        counterId,
        entityId,
        tokenNumber,
        userId: req.id,
        totalAmount: amount
    }], { session })
}

const updateStatusOfOrder = async (req) => {
    const { orderId, status } = req.body;
    console.log({ orderId, status })
    if (status !== ORDER_STATUS.COMPLETED && status !== ORDER_STATUS.READY && status !== ORDER_STATUS.IN_PROGRESS) {
        throwError({ status: STATUS_CODES.BAD_REQUEST, message: "Not a valid status." })
    }
    const order = await Order.exists({ _id: orderId });
    if (!order) {
        throwError({ status: STATUS_CODES.BAD_REQUEST, message: "No Such order exist." });
    }
    return Order.findOneAndUpdate({ _id: orderId }, { $set: { status } })
}

const getEntityOrders = async (req) => {
    const { entityId, body: { status, pageNo = 1, pageLimit = 10 } } = req;
    const query = {}
    if (!req.isAdmin) {
        if (req.role == ROLES.CUSTOMER) {
            query.userId = req.id;
        }
        else {
            query.entityId = entityId;
        }
        if (status) {
            query.status = status
        }
    }
    else {
        if (req.body.entityId) {
            query.entityId = req.body.entityId
        }
    }
    const skip = +(pageNo - 1) * +pageLimit;
    const [data, totalCount] = await Promise.all([
        Order.find(query, { items: 1, status: 1, tokenNumber: 1 })
            .populate({ path: "items.itemId", select: "itemName quantity description type currency image" })
            .sort({ tokenNumber: -1 })
            .skip(skip)
            .limit(pageLimit),
        Order.countDocuments(query)
    ]);
    return { data, totalCount }

}

const getOrderGroupByYears = async (req) => {
    const userId = req.id;
    const entityIds = (await Order.find({ userId }, { entityId: 1 }).lean()).map(doc => doc.entityId);
    const entities = await EntityDetails.find({ _id: { $in: entityIds } }, { entityName: 1, entityType: 1 }).lean();
    const entityMapper = {
    }
    entities.forEach(doc => {
        entityMapper[`${doc._id}`] = doc;
    })
    const ordersByYearAndEntity = await Order.aggregate([
        {
            // Stage 1: Match documents by userId
            $match: {
                userId: new mongoose.Types.ObjectId(userId)
            }
        },
        {
            // Stage 2: Add a field for the year based on the order's creation date
            $addFields: {
                year: { $year: "$createdAt" }
            }
        },
        {
            // Stage 3: Lookup the itemId to join with the MenuItem collection to get itemDetails
            $lookup: {
                from: "menuitems",  // Replace with the actual collection name for MenuItem
                localField: "items.itemId",
                foreignField: "_id",
                as: "itemDetails"
            }
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
                                            cond: { $eq: ["$$detail._id", "$$item.itemId"] }
                                        }
                                    },
                                    0
                                ]
                            }
                        }
                    }
                }
            }
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
                                entityId: "$$item.itemDetails.entityId"  // Ensure entityId is added to itemDetails
                            }
                        }
                    }
                }
            }
        },
        {
            // Stage 6: Group by year and entityId, accumulating orders
            $group: {
                _id: {
                    year: "$year",
                    entityId: "$entityId"  // Include entityId in the group
                },
                orders: {
                    $push: {
                        _id: "$_id",
                        status: "$status",
                        tokenNumber: "$tokenNumber",
                        items: "$items",
                        entityId: "$entityId"  // Include entityId in the order
                    }
                }
            }
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
                                            entityId: "$$item.itemDetails.entityId"
                                        }
                                    }
                                }
                            },
                            entityId: "$$order.entityId" // Include entityId in the order
                        }
                    }
                }
            }
        },
        {
            // Stage 8: Group by year and accumulate entities
            $group: {
                _id: "$_id.year",
                entities: {
                    $push: {
                        entityId: "$_id.entityId",
                        orders: "$orders"
                    }
                }
            }
        },
        {
            // Stage 9: Sort by year in descending order
            $sort: { _id: -1 }
        }
    ]);
    ordersByYearAndEntity.forEach(doc => {
        if (doc.entities?.length) {
            doc.entities.forEach(entity => {
                entity.entityDetails = entityMapper[entity.entityId];
                delete entity.entityId;
            })
        }
    })
    return ordersByYearAndEntity;
}
module.exports = {
    createOrder,
    updateStatusOfOrder,
    getEntityOrders,
    getOrderGroupByYears
}