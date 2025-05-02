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
