const express = require("express");
const router = express.Router();
const { STATUS_CODES } = require("../../../Utils/globalConstants");
const { register, login } = require("./service");

router.post("/login", async (req, res) => {
  try {
    const response = await login(req);
    return res.status(STATUS_CODES.OK).json({
      message: "User logged in succesfully",
      token: response.token,
      userDetails: response.user,
    });
  } catch (error) {
    console.error("error while login", error);
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.post("/register", async (req, res) => {
  try {
    const message = await register(req);
    return res.status(STATUS_CODES.OK).json(message);
  } catch (error) {
    console.error("error while login", error);
    return res.status(error.status || 400).json({ message: error.message });
  }
});
module.exports = router;
