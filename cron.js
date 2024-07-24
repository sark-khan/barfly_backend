const cron = require("node-cron");
const Event = require("./Models/Event");
const Entity = require("./Models/EntityDetails");
const { appClient } = require("./redis");
const { performEndOfDayTask } = require("./Utils/commonFunction");

// cron.schedule("0 0 * * *", () => {
//   performEndOfDayTask();
// });

const performEndOfDayTask = async () => {
    try {
      const today = new Date();
      today.setUTCDate(today.getUTCDate());
      const startOfDay = new Date(today);
      startOfDay.setUTCHours(0, 0, 0, 0);
  
      const endOfDay = new Date(today);
      endOfDay.setUTCHours(23, 59, 59, 999);
  
      const pipeline = [
        {
          $match: {
            $and: [
              // { from: { $gte: startOfDay } },
              { to: { $lte: endOfDay } },
              { entityId: { $exists: true } },
            ],
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
          $unwind: "$entityDetails",
        },
        {
          $project: {
            _id: "$entityId",
            entityDetails: {
                _id: 1,
                city: 1,
                street: 1,
                entityName: 1,
                entityType: 1,
              },
            event: {
              _id: "$_id",
              locationName: "$locationName",
              eventName: "$eventName",
              date: "$date",
              from: "$from",
              to: "$to",
              insiders: "$insiders",
              ageLimit: "$ageLimit",
              ownerId: "$ownerId",
            },
          },
        },
      ];
  
      const entityDataList = await Event.aggregate(pipeline).exec();
  
      console.log({ entityDataList });
  
      if (entityDataList.length) {
        await appClient
          .set("LIVE_ENTITY", JSON.stringify(entityDataList))
          .catch((error) => console.error(error));
      }
      const liveEntity = await appClient.get("LIVE_ENTITY");
      console.log({ liveEntityqqq: JSON.parse(liveEntity) });
    } catch (error) {
      console.error("Error performing end of day task:", error);
    }
  };
  
  // setInterval(() => {
  //   performEndOfDayTask();
  // }, 3000);
  