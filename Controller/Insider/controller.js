const express = require("express");
const router = express.Router();
const { STATUS_CODES } = require("../../Utils/globalConstants");
const { createInsider, createMenu, getItemsOfMenu, getMenuOfInsider } = require("./service");
const verifyToken = require("../../Utils/verifyToken");
const Insider = require("../../Models/Insider");

router.use(verifyToken);
router.use((req, res, next) => {
  if (req.role != "Owner") {
    return res
      .status(STATUS_CODES.NOT_AUTHORIZED)
      .json({ message: "Only Owner can perform this action" });
  }
  return next();
});
router.post("/insider", async (req, res) => {
  try {
    const response = await createInsider(req);
    return res.status(STATUS_CODES.OK).json({
      message: `${response.insiderName} created successfully`,
      data: response,
    });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.get("/get-insider", async (req, res) => {
  try {
    const insiders = await Insider.find(
      { ownerId: req.id },
      { insiderName: 1, insiderType: 1, updatedAt: 1 }
    ).sort({ updatedAt: -1 });
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Insiders succesfully fetched", data: insiders });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.post("/create-menu-of-insider", async (req, res) => {
  try {
    const response = await createMenu(req);
    return res.status(STATUS_CODES.OK).json({
      message: `Menu created successfully`,
      data: response,
    });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});


router.get("/get-menu-of-insider", async (req, res) => {
  try {
    const response = await getMenuOfInsider(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Menu succesfully fetched", data: response });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.get("/get-items-of-menu", async (req, res) => {
  try {
    const response = await getItemsOfMenu(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Items succesfully fetched", data: response });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.post("/create-items-of-menu",async(req,res)=>{
  try {
    const response = await getItemsOfMenu(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Items succesfully fetched", data: response });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
})

module.exports = router;
