const Queue = require("bull");
const { redisClient } = require("./../redis");
const Event = require("../Models/Event");
const { client } = require("../redis");

const eventQueue = new Queue("event-checker", {
  redis: {
    host: "127.0.0.1",
    port: 6379,
  },
});

eventQueue.process(async (job, done) => {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(tomorrow.getDate() + 1);

    const events = await Event.find({
      from: { $gte: tomorrow, $lt: dayAfter },
    });

    await client.set(
      `events:${tomorrow.toISOString().split("T")[0]}`,
      JSON.stringify(events)
    );

    console.log("Cached tomorrow's events in Redis");
    done();
  } catch (err) {
    console.error("Error caching tomorrow's events", err);
    done(err);
  }
});

module.exports = eventQueue;
