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

const emitOngoingEvents = async (io) => {
  try {
    const now = new Date();
    now.setSeconds(0, 0); // Normalize to the current minute

    const dateKey = now.toISOString().split("T")[0]; // 'YYYY-MM-DD'
    const redisKey = `events:${dateKey}`;

    const cachedData = await client.get(redisKey);
    const events = cachedData ? JSON.parse(cachedData) : [];

    events.forEach((event) => {
      const eventTime = new Date(event.from);
      eventTime.setSeconds(0, 0); // Normalize to minute precision

      if (eventTime.getTime() === now.getTime()) {
        const roomId = event.entityId || "default-room";
        io.to(roomId.toString()).emit("event:start", {
          message: "Event is starting",
          event,
        });
        console.log(
          `🔔 Emitted event for room ${roomId} at ${now.toISOString()}`
        );
      }
    });
  } catch (error) {
    console.error("Error in emitOngoingEvents:", error);
  }
};

module.exports = emitOngoingEvents;
