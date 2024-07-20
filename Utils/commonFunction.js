const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const SECRET_KEY = "BARFLY@WEBMOB456";

const hashPassword = (password) => {
  return bcrypt.hashSync(password, 8);
};

function generateOTP(length) {
  // Define the characters to be used in the OTP
  const characters =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let otp = "";

  // Generate a random OTP of the specified length
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    otp += characters[randomIndex];
  }

  return otp;
}

const comparePassword = async (inputPassword, storedPassword) => {
  return bcrypt.compare(inputPassword, storedPassword);
};

const getJwtToken = (user) => {
  const payload = {
    id: user._id,
    role: user.role,
    email: user.email,
    contactNumber: user.contactNumber,
    entityName: user.entityName,
    entityType: user.entityType,
  };
  return jwt.sign(payload, SECRET_KEY);
};

module.exports = { hashPassword, comparePassword, getJwtToken,generateOTP, SECRET_KEY };
