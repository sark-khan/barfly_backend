const Queue = require("bull");
const { getIo } = require("./socket");
const client = require("../redis");

const emitEventQueue = new Queue("emit-event", {
  redis: {
    host: "127.0.0.1",
    port: 6379,
  },
});

emitEventQueue.process(async (job, done) => {
  try {
    const { event } = job.data;
    const eventId = event._id;

    console.log(`🛠️ Processing job to emit event with ID: ${eventId}`);

    const io = getIo();
    if (!io) {
      console.error("Socket.IO instance not available!");
      return done(new Error("Socket.IO instance not available"));
    }

    const eventKey = `upcoming_event:${eventId}`;
    const eventData = await client.get(eventKey);

    if (!eventData) {
      console.log("Event not found in cache, skipping emission.");
      return done();
    }

    const cachedEvent = JSON.parse(eventData);
    console.log(`Retrieved event: ${cachedEvent.eventName}`);

    const currentTime = new Date();
    const eventStartTime = new Date(cachedEvent.from);

    console.log(
      `Current time: ${currentTime.toISOString()}\nEvent start time: ${eventStartTime.toISOString()}`
    );

    if (
      eventStartTime.getUTCDay() === currentTime.getUTCDay() &&
      eventStartTime.getUTCHours() === currentTime.getUTCHours() &&
      eventStartTime.getUTCMinutes() === currentTime.getUTCMinutes()
    ) {
      const room = cachedEvent.entityId.toString();
      io.to(room).emit("ongoingEvent", cachedEvent);
      console.log(`Emitted "ongoingEvent" to room: ${room}`);
    } else {
      console.log("Event is not yet due for emission.");
    }

    done();
  } catch (err) {
    console.error("Error processing job", err);
    done(err);
  }
});

module.exports = { emitEventQueue };
