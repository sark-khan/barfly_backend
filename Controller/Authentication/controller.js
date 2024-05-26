const express = require("express");
const router = express.Router();
const { STATUS_CODES } = require("../../Utils/globalConstants");
const { register, login } = require("./service");

router.post("/login", async (req, res) => {
  try {
    const response = await login(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "User logged in succesfully", response });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});


router.post("/register", async (req, res) => {
  try {
    const response = await register(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "User registered successfully", response });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
});

module.exports = router;
