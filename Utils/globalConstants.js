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
  MENU: "Menu",
  LOUNGE: "Lounge",
  FEEDBACK: "Feedback",
};
const FOOD_TYPE = {
  SNACK: "Food",
  DRINK: "Drink",
  ALCOHOL: "Alcohol",
  VEGAN: "Vegan",
};

const DRINKS_SIZE = {
  SMALL: "Small",
  MEDIUM: "Medium",
  LARGE: "Large",
};

const REDIS_KEYS = {
  LIVE_ENTITY: "LIVE_ENTITY",
};

const ORDER_STATUS = {
  IN_PROGRESS: "InProgress",
  READY: "Ready",
  COMPLETED: "Completed",
  WAITING: "Waiting",
  CANCELLED: "Cancelled",
};

const KEY_TYPE_PREFIXES = {
  USER_TOKEN: "USR:",
  TEMPORARY_TOKEN: "TMP:TKN:",
  OTP: "OTP_",
  LOGIN: "LOGIN",
  SIGNUP: "SIGNUP",
  EMAIL_OTP: "EMAIL_OTP_",
};

const CARD_TYPE = {
  CREDIT_CARD: "creditCard",
  DEBIT_CARD: "debitCard",
};

const STATUS = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  DELETED: "Deleted",
};

const EDIT_ACTION = {
  EDIT: "edit",
  DELETE: "delete",
};

const EXPERIENCE_TYPE = {
  GOOD: "GOOD",
  DECENT: "DECENT",
  BAD: "BAD",
};

module.exports = {
  STATUS_CODES,
  ROLES,
  PRODUCT_TYPE,
  INSIDER_TYPE,
  DRINKS_SIZE,
  FOOD_TYPE,
  REDIS_KEYS,
  ORDER_STATUS,
  KEY_TYPE_PREFIXES,
  CARD_TYPE,
  STATUS,
  EDIT_ACTION,
  EXPERIENCE_TYPE,
};
