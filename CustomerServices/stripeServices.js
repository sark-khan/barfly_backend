const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const StripeModel = require("./../Models/Stripe");
const throwError = require("./../Utils/throwError");
const {
  STATUS_CODES,
  STRIPE_PAYMENT_STATUS,
} = require("../Utils/globalConstants");

const createPaymentIntent = async (req) => {
  const {
    userId,
    body: { amount, currency, paymentMethodType },
  } = req;

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100),
    currency,
    payment_method_types: [paymentMethodType],
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
  const { paymentIntentId, paymentMethodId } = req.body;

  try {
    const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: paymentMethodId,
    });

    const mappedStatus = getPaymentStatusForStripe(paymentIntent.status);

    const result = await StripeModel.updateOne(
      { stripePaymentIntentId: paymentIntentId },
      { $set: { paymentStatus: mappedStatus } }
    );

    if (result.nModified === 0) {
      console.error("Payment status update failed:", result);
    }

    return paymentIntent;
  } catch (error) {
    console.error("Error confirming payment:", error);
    throw error;
  }
};

// const confirmPaymentIntent = async (req) => {
//   const { paymentIntentId, paymentMethodId } = req.body;

//   const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
//     payment_method: paymentMethodId,
//   });
//   await StripeModel.updateOne(
//     { stripePaymentIntentId: paymentIntentId },
//     { $set: { paymentStatus: paymentIntent.status } }
//   );
//   return paymentIntent;

const getPaymentStatus = async (req) => {
  const { paymentIntentId } = req.query;
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  return paymentIntent;
};

module.exports = {
  createPaymentIntent,
  // createPaymentMethod,
  confirmPaymentIntent,
  getPaymentStatus,
};
