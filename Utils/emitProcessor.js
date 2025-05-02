const { emitEventQueue } = require("./emitQueue");
const { getIo } = require("./socket");

emitEventQueue.process(async (job) => {
  const { event } = job.data;
  const io = getIo();

  console.log(`🛠️ Job picked to emit event: ${event.eventName}`);

  if (!io) {
    console.error("❌ Cannot emit event. io instance not available.");
    return;
  }

  const room = event.entityId.toString();
  console.log(`📢 Emitting to room "${room}" for event: ${event.eventName}`);

  io.to(room).emit("ongoingEvent", event);

  console.log(`✅ Event emitted via socket: ${event.eventName}`);
});
