const express = require("express");
const router = express.Router();
const { STATUS_CODES } = require("../../../Utils/globalConstants");
const { register, login, logoutEntity } = require("./service");

const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

router.post("/login", async (req, res) => {
  try {
    const response = await login(req);
    return res.status(STATUS_CODES.OK).json({
      message: "User logged in succesfully",
      token: response.token,
      // userDetails: response.user,
    });
  } catch (error) {
    console.error("Error while login", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while login" });
  }
});

router.post("/register", upload.single("file"), async (req, res) => {
  try {
    const message = await register(req);
    return res.status(STATUS_CODES.OK).json(message);
  } catch (error) {
    console.error("Error while registering the user: ", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while registering the user" });
  }
});

router.post("/logout", async (req, res) => {
  try {
    const response = await logoutEntity(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Entity Logged out sucessfully.", response });
  } catch (error) {
    console.error("Error while logging out the entity: ", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || "Error while logging out the entity" });
  }
});

module.exports = router;
