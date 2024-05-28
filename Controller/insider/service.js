const Insider = require("../../Models/Insider");
const { STATUS_CODES } = require("../../Utils/globalConstants");
const throwError = require("../../Utils/throwError");

module.exports.createInsider = async (req) => {
  const insider = await User.findOne({ insider: req.body.insider }).lean();
  if (insider) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: "Add a unique insider"
    });
  }

  const newInsider = new Insider({
    insider:req.body.insider,
    insiderType: req.body.insiderType,
  });

  await newInsider.save();
  return newInsider;
};
