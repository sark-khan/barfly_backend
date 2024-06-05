const Insider = require("../../Models/Insider");

module.exports.createInsider = async (req, insiderType) => {
  const insiderCount = await Insider.countDocuments();

  const newInsiderName = `Insider ${insiderCount + 1}`;

  const insideObj = {
    insider: newInsiderName,
  };

  const newInsider = await Insider.create(insideObj);
  return newInsider;
};
