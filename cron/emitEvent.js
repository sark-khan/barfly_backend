// const cron = require("node-cron");
// const { client } = require("../redis");
// const dayjs = require("dayjs");
// const { io } = require("../app"); // <- import io

// cron.schedule("* * * * *", async () => {
//   const today = dayjs().format("YYYY-MM-DD");
//   const eventsJson = await client.get(`events:${today}`);
//   if (!eventsJson) return;

//   const events = JSON.parse(eventsJson);
//   const now = new Date();

//   events.forEach((event) => {
//     if (dayjs(event.from).isSame(now, "minute")) {
//       console.log("Emitting event now:", event);

//       if (event.entityId) {
//         io.to(event.entityId.toString()).emit("event-started", event);
//       } else {
//         io.emit("event-started", event);
//       }
//     }
//   });
// });

// const redis = require("./../redis");
// const dayjs = require("dayjs");
// const client = require("../redis");

// // const { client } = require("../redis");

// // const client = redis.createClient();

// // client.connect();

// const emitOngoingEvents = async (io) => {
//   const now = dayjs();
//   const key = `${now.format("HH:mm")}-${now.add(1, "minute").format("HH:mm")}`;

//   const eventsJson = await client.get(key);
//   if (!eventsJson) return;

//   const events = JSON.parse(eventsJson);

//   for (const event of events) {
//     const { entityId, eventId } = event;
//     io.to(entityId.toString()).emit("eventStarted", event);
//     console.log(`Event ${eventId} started, emitted to room ${entityId}`);
//   }
// };

// module.exports = emitOngoingEvents;

const client = require("../redis");
const moment = require("moment");

const emitOngoingEvents = async (io) => {
  try {
    const now = moment.utc().startOf("minute"); // current UTC minute
    const todayKey = `events:${now.format("YYYY-MM-DD")}`;

    const data = await client.get(todayKey);
    const events = JSON.parse(data || "[]");

    for (const event of events) {
      const eventTime = moment.utc(event.from).startOf("minute");
      if (eventTime.isSame(now)) {
        console.log(">>> Emitting event to room:", event.entityId);
        io.to(event.entityId.toString()).emit("event:start", event);
      }
    }
  } catch (err) {
    console.error("Emit error:", err.message);
  }
};

module.exports = emitOngoingEvents;
