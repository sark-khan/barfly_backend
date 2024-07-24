const { performEndOfDayTask } = require("./Utils/commonFunction");

performEndOfDayTask()
  .then(() => console.log("Entities with live event occuring today seeded "))
  .catch((err) => {
    console.log("error occured while seeding live events entities ");
  });
