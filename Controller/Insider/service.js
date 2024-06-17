const Bar = require("../../Models/Bar");
const Insider = require("../../Models/Insider");
const { STATUS_CODES, INSIDER_TYPE } = require("../../Utils/globalConstants");
const throwError = require("../../Utils/throwError");

module.exports.createInsider = async (req) => {
  const { insiderName, insiderType } = req.body;
  const insiders = await Insider.findOne({ insiderName, ownerId:req.id }, { _id: 1 });
  console.log({ insiders });
  if (insiders) {
    throwError({
      status: STATUS_CODES.CONFLICT,
      message: "This insider name already exists",
    });
  }
  const newInsider = await Insider.create({
    insiderName,
    insiderType,
    ownerId: req.id,
  });
  delete newInsider.createAt;
  delete newInsider.updatedAt;
  delete newInsider.ownerId;
  return newInsider;
};

module.exports.createMenu = async (req) => {
  const { menuName, menuIcon, insiderId } = req.body;
  const insiderDetails = await Insider.findOne({
    ownerId: req.id,
    _id: insiderId,
  }).lean();

  if (!insiderDetails) {
    throwError({
      status: STATUS_CODES.NOT_ACCEPTABLE,
      message: "No such Insider exists for this owner",
    });
  }
  if (insiderDetails.insiderType === "Bar") {
    const existingBarDetails = await Bar.findOne(
      { name: menuName, insiderId: insiderDetails._id },
      { _id: 1 }
    );
    if (existingBarDetails) {
      throwError({
        status: STATUS_CODES.CONFLICT,
        message: "This menu name already exists",
      });
    }
    const barDetails = await Bar.create({
      name: menuName,
      icon: menuIcon,
      insiderId,
    });
    return barDetails;
  }
  throwError({ status: STATUS_CODES.BAD_REQUEST, message: "Not Authorised " });
};

module.exports.getItemsOfMenu = async (req) => {
  const { insiderType, id } = req.query;
  console.log("reacccc", { insiderType });
  if (insiderType === "Bar") {
    const barDetails = await Bar.findById(id).sort({ updatedAt: -1 });
    console.log({ barDetails });
    return barDetails;
  }
  throwError({
    status: STATUS_CODES.BAD_REQUEST,
    message: "This is not a valid Request",
  });
};

module.exports.getMenuOfInsider = async (req) => {
  const { insiderId } = req.query;
  const insiderDetails = await Insider.findById(insiderId);
  if (insiderDetails.insiderType === INSIDER_TYPE.BAR) {
    const menuList = await Bar.find({ insiderId });
    return menuList;
  }
  throwError({ status: STATUS_CODES.BAD_REQUEST, message: "Invalid Request" });
  // const menuList= await
};

module.exports.createItemsOfMenu = async (req) => {
  const { type, description, quantity, image, price, barId, itemName } =
    req.body;
  const barDetails = await Bar.findById(barId);
  if (!barDetails) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "No such Menu exists",
    });
  }
  barDetails.items.push({
    price,
    description:"hello",
    type,
    image,
    quantity,
    itemName,
  });

  await barDetails.save();
  return barDetails;
};
