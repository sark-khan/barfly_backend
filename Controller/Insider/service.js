const Bar = require("../../Models/Bar");
const Insider = require("../../Models/Insider");
const Event = require("../../Models/Event");
const { STATUS_CODES, INSIDER_TYPE } = require("../../Utils/globalConstants");
const throwError = require("../../Utils/throwError");
const mongoose = require("mongoose");

module.exports.createInsider = async (req) => {
  const { insiderName, insiderType } = req.body;
  const insiders = await Insider.findOne(
    { insiderName, ownerId: req.id },
    { _id: 1 }
  );
  console.log({ insiders });
  if (insiders) {
    throwError({
      status: STATUS_CODES.CONFLICT,
      message: "This insider name already exists",
    });
  }

  let updateFields = {};
  if (insiderType === INSIDER_TYPE.BAR) {
    updateFields = { insiderName, hasBar: true, ownerId: req.id };
  } else if (insiderType === INSIDER_TYPE.LOUNGE) {
    updateFields = { insiderName, hasLounge: true, ownerId: req.id };
  } else if (insiderType === INSIDER_TYPE.FEEDBACK) {
    updateFields = { insiderName, hasFeedback: true, ownerId: req.id };
  } else {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Invalid insider type",
    });
  }

  const newInsider = await Insider.findOneAndUpdate(
    { insiderName },
    { $set: updateFields },
    { new: true, upsert: true }
  );
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
    description: "hello",
    type,
    image,
    quantity,
    itemName,
  });

  await barDetails.save();
  return barDetails;
};
module.exports.createEvent = async (req) => {
  const { locationName, eventName, date, from, to, insiders, ageLimit } =
    req.body;
  const ownerId = req.id;
  const insiderIds=[];
  const insidersList= insiders.map((insiderDetails)=>{
    insiderIds.push(insiderDetails.insiderId);
    const obj={
      insiderId:insiderDetails.insiderId,
      isBar: insiderDetails.isBar,
      isLounge: insiderDetails.isLounge,
      isFeedback: insiderDetails.isFeedback
    }
    return obj;
  })
  const existingInsiders = await Insider.find({ _id: {$in:insiderIds}, ownerId });
  console.log({existingInsiders});
  if(existingInsiders.length!= insiderIds.length)
  {
    throwError({
      status: STATUS_CODES.NOT_FOUND,
      message: "Insider does not exist",
    });
  }

  const existingEvent = await Event.findOne({
    locationName,
    eventName,
    date,
    from,
    to,
    ownerId,
  });

  if (existingEvent) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: "An event with the same details already exists",
    });
  }

  const newEvent = new Event({
    locationName,
    eventName,
    date,
    from,
    to,
    ageLimit,
    ownerId,
    insiders:insidersList
    // insiders:[{}]
  });

  const savedEvent = await newEvent.save();
  return savedEvent;
};

module.exports.getUpcomingEvents = async (req) => {
  const currentDateTime = new Date();
  const ownerId = req.id;
  const upcomingEvents = await Event.find({
    ownerId,
    date: { $gte: currentDateTime },
  }).sort({ date: 1 });

  return upcomingEvents;
};

module.exports.getDistinctMonthsAndYears = async (req) => {
  const ownerId = req.id;
  const distinctMonthsAndYears = await Event.aggregate([
    {
      $match: {
        ownerId: mongoose.Types.ObjectId(ownerId),
        date: { $lt: new Date() },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: "$date" },
          month: { $month: "$date" },
        },
      },
    },
    {
      $sort: {
        "_id.year": -1,
        "_id.month": -1,
      },
    },
  ]);

  return distinctMonthsAndYears.map((doc) => ({
    year: doc._id.year,
    month: doc._id.month,
  }));
};

module.exports.getEventsByMonthAndYear = async (month, year) => {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1);

  const events = await Event.find({
    date: {
      $gte: startDate,
      $lt: endDate,
    },
  }).sort({ date: 1 });

  return events;
};
