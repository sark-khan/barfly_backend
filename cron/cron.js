// const cron = require("node-cron");
// const eventQueue = require("../Utils/bullQueue");

// cron.schedule("0 0 * * *", async () => {
//   console.log("Cron triggered at midnight");
//   await eventQueue.add({}, { attempts: 3 });
// });

const cron = require("node-cron");
const emitOngoingEvents = require("./emitEvent");

let ioInstance = null;

const setupCron = (io) => {
  ioInstance = io;

  cron.schedule("* * * * *", () => {
    console.log("Running cron to emit events...");
    emitOngoingEvents(ioInstance);
  });
};

module.exports = setupCron;
