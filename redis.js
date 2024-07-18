const { createClient } = require("redis");

const clientKeys = {
  url: "redis://localhost:6379"
};
const appClient = createClient(clientKeys);

appClient.on("error", (err) => console.log("Redis client Error", err));

appClient
  .connect()
  .then(() => console.info("------------------Redis application client connected--------------------"))
  .catch((err) => console.error(err));

module.exports = {
  appClient,
};
