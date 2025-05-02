const cron = require("node-cron");
const emitOngoingEvents = require("./emitEvent");
const eventQueue = require("./queues/eventQueue");

let ioInstance = null;

const setupCron = (io) => {
  ioInstance = io;

  cron.schedule("* * * * *", async () => {
    console.log("Running cron to emit events...");

    // 1. Emit active events via socket
    emitOngoingEvents(ioInstance);

    // 2. Cache upcoming events via Bull queue
    await eventQueue.add(
      {},
      {
        removeOnComplete: true,
        removeOnFail: true,
      }
    );
  });
};

module.exports = setupCron;
