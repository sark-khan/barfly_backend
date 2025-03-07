const express = require("express");
const router = express.Router();
const { STATUS_CODES } = require("../../../Utils/globalConstants");
const {
  register,
  login,
  sendOtp,
  reSendOtp,
  countRTag,
  logoutUser,
  checkAndProvideCountRTag,
  deleteAccount,
} = require("./services");

router.post("/login", async (req, res) => {
  try {
    await login(req);
    return res.status(STATUS_CODES.OK).json({
      message: "User logged in succesfully",
      // token: response.token,
      // userDetails: response.user,
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
    return res.status(STATUS_CODES.OK).json({
      message: "User registered successfully",
      userObj: response.userObj,
      token: response.token,
    });
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

router.get("/check-and-generate-countR-tag", async (req, res) => {
  try {
    const countRTag = await checkAndProvideCountRTag(req);
    return res.status(STATUS_CODES.OK).json({
      message: "CountR-Tag generated successfully.",
      availableTags: countRTag,
    });
  } catch (error) {
    console.error("Error while generated CountR-Tag: ", error);

    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while generated CountR-Tag" });
  }
});

router.post("/logout", async (req, res) => {
  try {
    const response = await logoutUser(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "User Logged out sucessfully.", response });
  } catch (error) {
    console.error("Error while logging out the user: ", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while logging out the user" });
  }
});

router.post("/delete-account", async (req, res) => {
  try {
    await deleteAccount(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "User account deleted successfully." });
  } catch (error) {
    console.error("Error while deleting the account: ", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while deleting the account." });
  }
});

module.exports = router;
