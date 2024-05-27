const jwt = require("jsonwebtoken");
const { SECRET_KEY } = require("../Utils/commonFunction");
const { STATUS_CODES } = require("../Utils/globalConstants");

const verifyToken = (req, res, next) => {
  const token = req.headers["Token"];

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
    req.productName = decoded.productName;
    req.productType = decoded.productType;
    next();
  });
};

module.exports = verifyToken;

