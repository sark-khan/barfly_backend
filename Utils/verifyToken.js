const jwt = require("jsonwebtoken");
const { SECRET_KEY } = require("../Utils/commonFunction");
const { STATUS_CODES, ROLES } = require("../Utils/globalConstants");
const { t, getLanguageFromRequest } = require("./translator");

const verifyToken = (req, res, next) => {
  const token = req.headers["token"];
  const lang = getLanguageFromRequest(req);

  if (!token) {
    return res
      .status(STATUS_CODES.NOT_AUTHORIZED)
      .json({ message: t("AUTH_TOKEN_MISSING", lang) });
  }
  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) {
      return res
        .status(STATUS_CODES.NOT_AUTHORIZED)
        .json({ message: t("AUTH_TOKEN_INVALID", lang) });
    }
    req.id = decoded.id;
    req.userId = decoded.userId;
    req.role = decoded.role;
    req.email = decoded.email;
    // req.contactNumber = decoded.contactNumber;
    req.entityName = decoded.entityName;
    req.entityId = decoded.entityId;
    req.entityType = decoded.entityType;
    req.isAdmin = decoded.role == ROLES.ADMIN;
    req.countrTag = decoded.countrTag;
    next();
  });
};

module.exports = verifyToken;
