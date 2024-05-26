const bcrypt = require("bcrypt");
const jwt = require('jsonwebtoken')
const SECRET_KEY = 'BARFLY@WEBMOB456'

const hashPassword =  (password) => {
  return bcrypt.hashSync(password, 8);
};

const comparePassword = async (inputPassword, storedPassword) => {
  return bcrypt.compare(inputPassword, storedPassword);
};

const getJwtToken = (user) => {
  const payload = {
    id: user._id,
    role: user.role,
    email: user.email,
    contactNumber: user.contactNumber,
    productName: user.productName,
    productType: user.productType,

  }
  return jwt.sign(payload, SECRET_KEY)
}

module.exports = { hashPassword, comparePassword, getJwtToken, SECRET_KEY };
  