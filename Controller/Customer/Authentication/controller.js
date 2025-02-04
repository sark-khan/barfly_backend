const express = require("express");
const router = express.Router();
const { STATUS_CODES } = require("../../../Utils/globalConstants");
const {
  register,
  login,
  sendOtp,
  reSendOtp,
  countRTag,
} = require("./services");

router.post("/login", async (req, res) => {
  try {
    const response = await login(req);
    return res.status(STATUS_CODES.OK).json({
      message: "User logged in succesfully",
      token: response.token,
      userDetails: response.user,
    });
  } catch (error) {
    console.error("Error while Logging-in the user: ", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while Logging-in the user." });
  }
});

router.post("/register", async (req, res) => {
  try {
    const response = await register(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "User registered successfully", response });
  } catch (error) {
    console.error("Error while registering the user.: ", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while registering the user." });
  }
});

router.post("/countR-tag", async (req, res) => {
  try {
    await countRTag(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "CountR-Tag accepted successfully." });
  } catch (error) {
    console.error("Error while creating CountR-Tag: ", error);

    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while creating CountR-Tag" });
  }
});

// router.post("/send-otp", async (req, res) => {
//   try {
//     await sendOtp(req);
//     return res
//       .status(STATUS_CODES.OK)
//       .json({ message: "Otp Sent Successfully" });
//   } catch (error) {
//     return res
//       .status(error.status || STATUS_CODES.SERVER_ERROR)
//       .json({ message: error.message || "Error occured while sending otp" });
//   }
// });

// router.post("/resend-otp", async (req, res) => {
//   try {
//     await reSendOtp(req);
//     return res
//       .status(STATUS_CODES.OK)
//       .json({ message: "Otp re sent Successfully" });
//   } catch (error) {
//     return res
//       .status(error.status || STATUS_CODES.SERVER_ERROR)
//       .json({ message: error.message || "Error occured while sending otp" });
//   }
// });

module.exports = router;
