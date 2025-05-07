const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const StripeModel = require("./../Models/Stripe");
const throwError = require("./../Utils/throwError");
const {
  STATUS_CODES,
  STRIPE_PAYMENT_STATUS,
} = require("../Utils/globalConstants");
const User = require("../Models/User");
const EntityDetails = require("../Models/EntityDetails");
const Order = require("../Models/Order");

// const createPaymentIntent = async (req) => {
//   const {
//     userId,
//     body: { amount, currency, paymentMethodType },
//   } = req;

//   const paymentIntent = await stripe.paymentIntents.create({
//     amount: Math.round(amount * 100),
//     currency,
//     payment_method_types: [paymentMethodType],
//   });

//   const obj = {
//     amount,
//     currency,
//     paymentMethodType,
//     userId,
//     stripePaymentIntentId: paymentIntent.id,
//     lastPaymentDate: new Date(),
//   };

//   await StripeModel.create(obj);
//   return paymentIntent;
// };

// const createPaymentIntent = async (req) => {
//   const {
//     userId,
//     body: { amount, currency, paymentMethodType = "card" },
//   } = req;

//   if (paymentMethodType === "twint" && currency.toLowerCase() !== "chf") {
//     throw new Error("TWINT is only supported for CHF currency.");
//   }

//   const paymentIntent = await stripe.paymentIntents.create({
//     amount: Math.round(amount * 100),
//     currency,
//     payment_method_types: [paymentMethodType],
//     metadata: {
//       integration_check: paymentMethodType,
//       userId,
//     },
//   });

//   const obj = {
//     amount,
//     currency,
//     paymentMethodType,
//     userId,
//     stripePaymentIntentId: paymentIntent.id,
//     lastPaymentDate: new Date(),
//   };

//   await StripeModel.create(obj);

//   return paymentIntent;
// };

const createPaymentIntent = async (req) => {
  const {
    userId,
    body: {
      amount,
      currency,
      paymentMethodType = "card",
      restaurantStripeAccountId = "acct_1RCKsm2ag6dAhPwK",
      orderId,
    },
  } = req;

  if (paymentMethodType === "twint" && currency.toLowerCase() !== "chf") {
    throw new Error("TWINT is only supported for CHF currency.");
  }

  const order = await Order.findById(orderId);
  const platformFees = order?.platformFees || global.PLATFORM_FEES;

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100),
    currency,
    payment_method_types: [paymentMethodType],
    application_fee_amount: Math.round(platformFees * 100),
    transfer_data: {
      destination: restaurantStripeAccountId,
    },
    metadata: {
      integration_check: paymentMethodType,
      userId,
      orderId,
    },
  });

  const obj = {
    amount,
    currency,
    paymentMethodType,
    userId,
    stripePaymentIntentId: paymentIntent.id,
    lastPaymentDate: new Date(),
  };

  await StripeModel.create(obj);
  return paymentIntent;
};

// const createPaymentMethod = async (req) => {
//   const { cardNumber, expMonth, expYear, cvc, type } = req.body;

//   // if (!cardNumber || !expMonth || !expYear || !cvc) {
//   //   throwError({
//   //     status: STATUS_CODES.BAD_REQUEST,
//   //     message: "Card details are required.",
//   //   });
//   // }

//   const paymentMethod = await stripe.paymentMethods.create({
//     type: type || "card",
//     card: {
//       number: cardNumber,
//       exp_month: expMonth,
//       exp_year: expYear,
//       cvc: cvc,
//     },
//   });
//   return paymentMethod;
// };

const getPaymentStatusForStripe = (stripeStatus) => {
  switch (stripeStatus) {
    case "succeeded":
      return STRIPE_PAYMENT_STATUS.SUCCESSFUL;
    case "processing":
      return STRIPE_PAYMENT_STATUS.PENDING;
    case "canceled":
      return STRIPE_PAYMENT_STATUS.CANCELLED;
    case "incomplete":
      return STRIPE_PAYMENT_STATUS.INCOMPLETE;
    case "requires_payment_method":
    case "requires_action":
    case "requires_confirmation":
    case "requires_capture":
      return STRIPE_PAYMENT_STATUS.PENDING;
    default:
      return STRIPE_PAYMENT_STATUS.FAILED;
  }
};

const confirmPaymentIntent = async (req) => {
  const { paymentIntentId, paymentMethodId, paymentMethodType } = req.body;

  try {
    const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: paymentMethodId,
    });

    console.log("Stripe payment intent status:", paymentIntent.status);

    const mappedStatus = getPaymentStatusForStripe(paymentIntent.status);
    console.log("Mapped status for DB:", mappedStatus);

    const updatePayload = {
      paymentStatus: mappedStatus,
      paymentMethodUsed: paymentMethodType || "unknown",
    };

    const existing = await StripeModel.findOne({
      stripePaymentIntentId: paymentIntentId,
    });
    console.log("Before update, DB record is:", existing);
    const result = await StripeModel.updateOne(
      { stripePaymentIntentId: paymentIntentId },
      { $set: updatePayload }
    );

    if (result.matchedCount === 0) {
      console.warn("No document found with this paymentIntentId");
    } else if (result.modifiedCount === 0) {
      console.warn(
        "Document found but no fields were modified. Maybe already up-to-date?"
      );
    } else {
      console.log("Payment status successfully updated in DB");
    }

    console.log(
      "Confirmed payment intent:",
      paymentIntent.id,
      "Status:",
      paymentIntent.status
    );

    return paymentIntent;
  } catch (error) {
    console.error("Error confirming payment intent:", error.message);

    // Optional: update the DB to mark the payment as failed
    await StripeModel.updateOne(
      { stripePaymentIntentId: paymentIntentId },
      { $set: { paymentStatus: STRIPE_PAYMENT_STATUS.FAILED } }
    );

    throw error;
  }
};

const getPaymentStatus = async (req) => {
  const { paymentIntentId } = req.query;
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  return paymentIntent;
};

const createStripeOnboardingLink = async (req) => {
  // try {
  const {
    entityId,
    body: { email },
  } = req;

  if (!entityId || !email) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Missing entityId or email",
    });
  }

  const account = await stripe.accounts.create({
    type: "express",
    country: "CH",
    email,
    business_type: "individual",
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: {
      entityId,
    },
  });
  console.log({ account });

  await EntityDetails.updateOne(
    { _id: entityId },
    { stripeAccountId: account.id }
  );

  const accountLink = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: `${process.env.HOST_URL}/app/profile/bank-account`,
    return_url: `${process.env.HOST_URL}/app/profile/bank-account`,
    type: "account_onboarding",
  });
  await EntityDetails.updateOne(
    { _id: entityId },
    { bankLinkUrl: accountLink.url }
  );

  return {
    success: true,
    message: "Stripe onboarding link created",
    url: accountLink.url,
  };
  // } catch (error) {
  //   console.error("Stripe Onboarding Error:", error);
  //   return {
  //     success: false,
  //     message: "Failed to create Stripe onboarding link",
  //     error: error.message,
  //   };
  // }
};

// const checkStripeAccountMissingFields = async (req) => {
//   try {
//     const { entityId } = req;

//     if (!entityId) {
//       throwError({
//         status: STATUS_CODES.BAD_REQUEST,
//         message: "Missing entityId",
//       });
//     }

//     const entity = await EntityDetails.findById(entityId);
//     if (!entity?.stripeAccountId) {
//       throwError({
//         status: STATUS_CODES.BAD_REQUEST,
//         message: "No Stripe account found for this entity",
//       });
//     }

//     const account = await stripe.accounts.retrieve(entity.stripeAccountId);

//     const missingFields = [];

//     if (!account.business_profile?.name) {
//       missingFields.push("Business Profile Name");
//     }
//     if (!account.business_profile?.mcc) {
//       missingFields.push("MCC (Merchant Category Code)");
//     }
//     if (!account.business_profile?.url) {
//       missingFields.push("Business URL");
//     }

//     if (
//       !account.documents?.verification?.status ||
//       account.documents?.verification?.status !== "verified"
//     ) {
//       missingFields.push("Identity Verification Document");
//     }
//     if (!account.business_type || account.business_type === "individual") {
//       missingFields.push("Business Type or Incorporation Document");
//     }

//     if (!account.external_accounts?.data?.length) {
//       missingFields.push("Bank Account");
//     }

//     return {
//       success: true,
//       message: "Stripe account check complete",
//       missingFields: missingFields.length
//         ? missingFields
//         : ["No fields missing"],
//     };
//   } catch (error) {
//     console.error("Stripe Account Check Error:", error);
//     throwError({
//       status: STATUS_CODES.BAD_REQUEST,
//       message: "Failed to check Stripe account fields",
//     });
//   }
// };

const checkStripeAccountMissingFields = async (req) => {
  try {
    const { entityId } = req;

    if (!entityId) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "Missing entityId",
      });
    }

    const entity = await EntityDetails.findById(entityId);
    if (!entity?.stripeAccountId) {
      return {
        success: true,
        message: "No Stripe account associated with this entity",
        hasMissingFields: true,
        missingFields: [],
      };
    }

    let account;
    try {
      account = await stripe.accounts.retrieve(entity.stripeAccountId);
    } catch (err) {
      console.error("Stripe retrieve failed:", err);
      return {
        success: true,
        message: "Stripe account not found or inaccessible",
        hasMissingFields: true,
        missingFields: [],
      };
    }

    const missingFields = [];

    if (!account?.business_profile?.name) {
      missingFields.push("Business Profile Name");
    }
    if (!account?.business_profile?.mcc) {
      missingFields.push("MCC (Merchant Category Code)");
    }
    if (!account?.business_profile?.url) {
      missingFields.push("Business URL");
    }

    if (
      account?.verification?.disabled_reason ||
      account?.requirements?.disabled_reason
    ) {
      missingFields.push("Identity Verification Document");
    }

    if (!account?.business_type || account.business_type === "individual") {
      missingFields.push("Business Type or Incorporation Document");
    }

    if (!account?.external_accounts?.data?.length) {
      missingFields.push("Bank Account");
    }

    return {
      success: true,
      message: "Stripe account check complete",
      hasMissingFields: !!missingFields.length,
      missingFields,
    };
  } catch (error) {
    console.error("Stripe Account Check Error:", error);
    throwError({
      status: STATUS_CODES.INTERNAL_SERVER_ERROR,
      message: "Failed to check Stripe account fields",
    });
  }
};

const continueStripeOnboarding = async (req) => {
  try {
    const { entityId } = req;

    if (!entityId) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "Missing entityId",
      });
    }

    // Get the Stripe account ID from your database
    const entity = await EntityDetails.findById(entityId);
    if (!entity?.stripeAccountId) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "No Stripe account found for this entity",
      });
    }

    // Generate a new onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: entity.stripeAccountId,
      refresh_url: `${process.env.HOST_URL}/app/profile/bank-account`,
      return_url: `${process.env.HOST_URL}/app/profile/bank-account`,
      type: "account_onboarding",
    });

    // Optional: Update latest link in DB
    await EntityDetails.updateOne(
      { _id: entityId },
      { bankLinkUrl: accountLink.url }
    );

    return {
      success: true,
      url: accountLink.url,
    };
  } catch (error) {
    console.error("Stripe Resume Onboarding Error:", error);
    throw error;
  }
};

const retrieveAccountBalance = async (req) => {
  try {
    const { accountId } = req.body;
    const balance = await stripe.balance.retrieve({
      stripeAccount: accountId,
    });

    return {
      success: true,
      available: balance.available,
      pending: balance.pending,
    };
  } catch (error) {
    console.error("Error fetching balance:", error);
    return {
      success: false,
      message: "Failed to fetch Stripe balance",
      error: error.message,
    };
  }
};

const getStripeAccount = async (req) => {
  try {
    const { accountId } = req.query;
    const account = await stripe.accounts.retrieve(accountId);

    const bankAccounts = await stripe.accounts.listExternalAccounts(accountId, {
      object: "bank_account",
    });

    return {
      account: account || [],
      bankAccounts: bankAccounts?.data || [],
    };
  } catch (err) {
    console.error("Error fetching Stripe account:", err);
    return {
      account: null,
      bankAccounts: [],
      error: err.message,
    };
  }
};

module.exports = {
  createPaymentIntent,
  confirmPaymentIntent,
  getPaymentStatus,
  createStripeOnboardingLink,
  getStripeAccount,
  retrieveAccountBalance,
  continueStripeOnboarding,
  checkStripeAccountMissingFields,
};
