const Queue = require("bull");
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
    // Get today's date in UTC
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date(today);
    endOfDay.setUTCDate(today.getUTCDate() + 1);

    // Find all events for today based on `from` field (assumed to be in GMT)
    const events = await Event.find({
      from: {
        $gte: today,
        $lt: endOfDay,
      },
    });

    // Cache the events in Redis with key like: events:2025-04-28
    const redisKey = `events:${today.toISOString().split("T")[0]}`;
    await client.set(redisKey, JSON.stringify(events));

    console.log(
      `✅ Cached ${events.length} event(s) for today in Redis with key: ${redisKey}`
    );
    done();
  } catch (err) {
    console.error("❌ Error caching today's events in Redis:", err);
    done(err);
  }
});

module.exports = eventQueue;
