const Queue = require("bull");
const client = require("../redis");
const Event = require("../Models/Event");

const eventQueue = new Queue("event-checker", {
  redis: {
    host: "127.0.0.1",
    port: 6379,
  },
});

eventQueue.process(async (job, done) => {
  try {
    const now = new Date();
    const fiveMinutesLater = new Date(now.getTime() + 1 * 60000); // 5 minutes later

    const upcomingEvents = await Event.find({
      from: { $gte: now, $lte: fiveMinutesLater },
    });

    if (upcomingEvents.length === 0) {
      console.log("⏱️ No events in the next 2 minutes");
      return done();
    }

    // Cache each event using event ID and start time
    for (const event of upcomingEvents) {
      const eventKey = `upcoming_event:${event._id}`;
      const isCached = await client.exists(eventKey);
      if (!isCached) {
        await client.set(eventKey, JSON.stringify(event), "EX", 600); // expire in 10 min
        console.log(`✅ Cached event starting soon: ${event.eventName}`);
      } else {
        console.log(`🟡 Event already cached: ${event.eventName}`);
      }
    }

    done();
  } catch (err) {
    console.error("❌ Error caching upcoming events:", err);
    done(err);
  }
});

module.exports = eventQueue;
