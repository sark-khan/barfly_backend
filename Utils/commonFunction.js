const bcrypt = require("bcrypt");

const hashPassword =  (password) => {
  return bcrypt.hashSync(password, 8);
};

const comparePassword = async (inputPassword, storedPassword) => {
  return bcrypt.compare(inputPassword, storedPassword);
};


module.exports = { hashPassword, comparePassword };
