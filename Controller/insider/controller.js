const express = require("express");
const router = express.Router();
const { STATUS_CODES } = require("../../Utils/globalConstants");
const { createInsider } = require("./service");

router.post("/insider", async (req, res) => {
    try {
      const response = await createInsider(req);
      return res
        .status(STATUS_CODES.OK)
        .json({ message: "Insider created succesfully", insider: response.insider });
    } catch (error) {
      return res.status(error.status || 400).json({ message: error.message });
    }
  });

  module.exports = router;