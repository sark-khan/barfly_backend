const cron = require("node-cron");
const Event = require("./Models/Event");
const Entity = require("./Models/EntityDetails");
const { appClient } = require("./redis");
const { performEndOfDayTask } = require("./Utils/commonFunction");

// Uncomment this line to schedule the task to run at midnight every day
cron.schedule("0 0 * * *", () => {
  performEndOfDayTask();
});


  
  // Use setInterval for testing purposes. In production, use the cron schedule.
//   setInterval(() => {
//     performEndOfDayTask();
//   }, 3000);
  
  
  // Use setInterval for testing purposes. In production, use the cron schedule.
//   setInterval(() => {
//     performEndOfDayTask();
//   }, 3000);
  