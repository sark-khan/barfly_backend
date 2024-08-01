const express = require("express");
const router = express.Router();
const { STATUS_CODES } = require("../../../Utils/globalConstants");
const { register, login, sendOtp, reSendOtp } = require("./services");

router.post("/login", async (req, res) => {
  try {
    console.log("dsdsd");
    const response = await login(req);
    return res.status(STATUS_CODES.OK).json({
      message: "User logged in succesfully",
      token: response.token,
      userDetails: response.user,
    });
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

router.post("/send-otp", async (req, res) => {
  try {
    await sendOtp(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Otp Sent Successfully" });
  } catch (error) {
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error occured while sending otp" });
  }
});

router.post("/resend-otp", async (req, res) => {
  try {
    await reSendOtp(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Otp re sent Successfully" });
  } catch (error) {
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error occured while sending otp" });
  }
});

module.exports = router;
