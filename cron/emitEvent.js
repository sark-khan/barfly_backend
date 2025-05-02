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
    // Get current time in GMT
    const now = new Date();
    const currentTime = new Date(
      now.getTime() + now.getTimezoneOffset() * 60000
    ); // Convert to UTC time

    const events = await client.get(
      `events:${currentTime.toISOString().split("T")[0]}`
    );

    if (events) {
      const parsedEvents = JSON.parse(events);

      parsedEvents.forEach((event) => {
        // Check if the event's 'from' time is the same as the current time
        const eventStartTime = new Date(event.from);
        if (
          eventStartTime.getUTCDay() === currentTime.getUTCDay() &&
          eventStartTime.getUTCHours() === currentTime.getUTCHours() &&
          eventStartTime.getUTCMinutes() === currentTime.getUTCMinutes()
        ) {
          console.log("Emitting event:", event);
          io.to(event.entityId.toString()).emit("ongoingEvent", event);
        }
      });
    }
  } catch (err) {
    console.error("Error emitting ongoing events:", err);
  }
};

module.exports = emitOngoingEvents;
