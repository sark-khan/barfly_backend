const express = require("express");
const router = express.Router();
const { STATUS_CODES } = require("../../../Utils/globalConstants");
const { register, login, logoutEntity } = require("./service");
const { t, getLanguageFromRequest } = require("../../../Utils/translator");

const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

router.post("/login", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await login(req);
    console.log({ response });
    return res.status(STATUS_CODES.OK).json({
      message: t("OWNER_LOGIN_SUCCESS", lang),
      token: response.token,
      userDetails: response.entityDetails,
    });
  } catch (error) {
    console.error("Error while login", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_LOGIN_ERROR", lang),
    });
  }
});

router.post("/register", upload.single("file"), async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const message = await register(req);
    return res.status(STATUS_CODES.OK).json(message);
  } catch (error) {
    console.error("Error while registering the user: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_REGISTER_ERROR", lang),
    });
  }
});

router.post("/logout", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await logoutEntity(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("ENTITY_LOGOUT_SUCCESS", lang), response });
  } catch (error) {
    console.error("Error while logging out the entity: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("ENTITY_LOGOUT_ERROR", lang),
    });
  }
});

module.exports = router;
