const STATUS_CODES = {
  BAD_REQUEST: 400,
  CONFLICT: 409,
  CREATED: 201,
  NOT_ACCEPTABLE: 406,
  NOT_AUTHENTICATED: 401,
  NOT_AUTHORIZED: 403,
  NOT_FOUND: 404,
  OK: 200,
  RESOURCE_CREATED: 201,
  SERVER_ERROR: 500,
  TOO_MANY_REQUESTS: 429,
};

const ROLES = {
  CUSTOMER: "Customer",
  STORE_OWNER: "Owner",
  ADMIN: "Admin",
};

const PRODUCT_TYPE = {
  BAR: "Bar",
  RESTAURANT: "Restaurant",
  FOODTRUCK: "Foodtruck",
  CLUB: "Club",
};

const INSIDER_TYPE = {
  BAR: "Bar",
  LOUNGE: "Lounge",
  FEEDBACK: "Feedback",
};
const FOOD_TYPE = {
  SNACK: "Snacks",
  DRINK: "Drink",
};

const DRINKS_SIZE = {
  SMALL: "Small",
  MEDIUM: "Medium",
  LARGE: "Large",
};

// const FOOD_TYPE = {
//   APPETIZER: "Appetizer",
//   MAINCOURSE: "Maincourse",
//   DESSERT: "Dessert",
// };

module.exports = {
  STATUS_CODES,
  ROLES,
  PRODUCT_TYPE,
  INSIDER_TYPE,
  DRINKS_SIZE,
  FOOD_TYPE,
};
