const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const {
  createPaymentIntent,
  confirmPaymentIntent,
  createPaymentMethod,
  getPaymentStatus,
} = require("../CustomerServices/stripeServices");
const { STATUS_CODES } = require("../Utils/globalConstants");

router.post("/create-payment", async (req, res) => {
  console.log("aa rha kya????????????<>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
  try {
    const paymentIntent = await createPaymentIntent(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error("Error while creating intent: ", error);
    res.status(STATUS_CODES.SERVER_ERROR).json({ error: error.message });
  }
});

// router.post("/create-payment-method", async (req, res) => {
//   try {
//     const response = await createPaymentMethod(req);
//     return res.status(STATUS_CODES.OK).json({
//       message: "Payment method created successfully.",
//       paymentMethodId: response.id,
//     });
//   } catch (error) {
//     console.error("Error creating payment method:", error);
//     return res.status(STATUS_CODES.SERVER_ERROR).json({
//       message: "Failed to create payment method.",
//       error: error.message,
//     });
//   }
// });

router.post("/confirm-payment", async (req, res) => {
  try {
    const paymentIntent = await confirmPaymentIntent(req);
    res.json({ status: paymentIntent.status });
  } catch (error) {
    console.error("Error while confirming the payment: ", error);
    res.status(STATUS_CODES.OK).json({ error: error.message });
  }
});

// /**
//  * Controller to get the status of a PaymentIntent.
//  */
router.get("/get-payment-status", async (req, res) => {
  try {
    const paymentIntent = await getPaymentStatus(req);
    return res.status(STATUS_CODES.OK).json({ data: paymentIntent });
  } catch (error) {
    res.status(STATUS_CODES.SERVER_ERROR).json({ error: error.message });
  }
});

// /**
//  * Controller to handle Stripe webhooks.
//  * Note: Make sure to use express.raw({ type: "application/json" }) middleware for this route.
//  */
// const stripeWebhook = (req, res) => {
//   const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
//   const sig = req.headers["stripe-signature"];
//   let event;

//   try {
//     event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
//   } catch (err) {
//     console.error("Webhook signature verification failed:", err.message);
//     return res.status(400).send(`Webhook Error: ${err.message}`);
//   }

//   // Handle different webhook events
//   switch (event.type) {
//     case "payment_intent.succeeded":
//       {
//         const paymentIntent = event.data.object;
//         // Example: Update user/order record
//         // user.paymentStatus = 'succeeded';
//         // user.stripePaymentIntentId = paymentIntent.id;
//         console.log("Payment succeeded:", paymentIntent.id);
//       }
//       break;
//     case "payment_intent.payment_failed":
//       {
//         const paymentIntent = event.data.object;
//         // Example: Update user/order record with failure status
//         // user.paymentStatus = 'failed';
//         console.log("Payment failed:", paymentIntent.id);
//       }
//       break;
//     default:
//       console.log(`Unhandled event type: ${event.type}`);
//   }

//   res.json({ received: true });
// };

module.exports = router;
