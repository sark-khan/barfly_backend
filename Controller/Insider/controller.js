const express = require("express");
const router = express.Router();
const { STATUS_CODES } = require("../../Utils/globalConstants");
const { createInsider } = require("./service");
const verifyToken = require("../../Utils/verifyToken");
const Insider = require("../../Models/Insider");

router.use(verifyToken);

router.post("/insider", async (req, res) => {
  try {
    const response = await createInsider(req);
    return res.status(STATUS_CODES.OK).json({
      message: `${response.insider} created successfully`,
      data: response,
    });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.get("/get-insider", async (res) => {
  try {
    const insiders = await Insider.find().lean();
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Insiders succesfully fetched", data: insiders });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});

module.exports = router;
