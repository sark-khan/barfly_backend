const jwt = require("jsonwebtoken");
const { SECRET_KEY } = require("../Utils/commonFunction");
const { STATUS_CODES, ROLES } = require("../Utils/globalConstants");

const verifyToken = (req, res, next) => {
  const token = req.headers["token"];

  if (!token) {
    return res
      .status(STATUS_CODES.NOT_AUTHORIZED)
      .json({ message: "No token provided" });
  }
  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) {
      return res
        .status(STATUS_CODES.NOT_AUTHORIZED)
        .json({ message: "Invalid token" });
    }
    req.id = decoded.id;
    req.role = decoded.role;
    req.email = decoded.email;
    req.contactNumber = decoded.contactNumber;
    req.entityName = decoded.entityName;
    req.entityId = decoded.entityId;
    req.entityType = decoded.entityType;
    req.isAdmin = decoded.role == ROLES.ADMIN
    next();
  });
};

module.exports = verifyToken;

