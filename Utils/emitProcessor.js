const Queue = require("bull"); // Ensure Queue is imported
const { getIo } = require("./socket"); // Assuming this gives you access to the Socket.IO instance
const client = require("../redis");

const emitEventQueue = new Queue("event-emitter", {
  redis: {
    host: "127.0.0.1",
    port: 6379,
  },
});

// Processing job for emitting events
emitEventQueue.process(async (job, done) => {
  try {
    const { eventId } = job.data; // The event ID passed to the job
    console.log(`🛠️ Processing job to emit event with ID: ${eventId}`);

    // Get the global socket.io instance
    const io = getIo();

    if (!io) {
      console.error("❌ Socket.IO instance not available!");
      return done(new Error("Socket.IO instance not available"));
    }

    // Retrieve the cached event from Redis
    const eventKey = `upcoming_event:${eventId}`;
    const eventData = await client.get(eventKey);

    if (!eventData) {
      console.log("⏳ Event not found in cache, skipping emission.");
      return done();
    }

    const event = JSON.parse(eventData);
    console.log(`📢 Retrieved event: ${event.eventName}`);

    // Check if the event's start time matches the current time
    const currentTime = new Date();
    const eventStartTime = new Date(event.from);

    // Log the comparison for debugging
    console.log(
      `Current time: ${currentTime.toISOString()}\nEvent start time: ${eventStartTime.toISOString()}`
    );

    if (
      eventStartTime.getUTCDay() === currentTime.getUTCDay() &&
      eventStartTime.getUTCHours() === currentTime.getUTCHours() &&
      eventStartTime.getUTCMinutes() === currentTime.getUTCMinutes()
    ) {
      console.log(
        `📢 Emitting event "${event.eventName}" to room: ${event.entityId}`
      );
      const room = event.entityId.toString();
      io.to(room).emit("ongoingEvent", event); // Emit the event via socket to the specific room
      console.log(`✅ Event "${event.eventName}" emitted to socket.`);
    } else {
      console.log("⏳ Event is not yet due for emission.");
    }

    done(); // Mark the job as complete
  } catch (err) {
    console.error("❌ Error processing job", err);
    done(err); // Pass error to done() to mark the job as failed
  }
});

module.exports = { emitEventQueue };
