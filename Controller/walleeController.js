const express = require("express");
const router = express.Router();

const {
  createWalleeTransaction,
  getWalleeTransactionStatus,
} = require("../CustomerServices/walleeServices");
const { STATUS_CODES } = require("../Utils/globalConstants");
const { t, getLanguageFromRequest } = require("../Utils/translator");

/**
 * Create a payment transaction and get payment page URL
 * POST /api/wallee/create-payment
 *
 * Request body:
 * {
 *   amount: number,      // Amount in the specified currency (e.g., 10.50)
 *   currency: string,    // Currency code (e.g., "CHF", "EUR")
 *   eventId: string,     // Event ID for the order
 *   paymentMethodType: string // Optional: "card", "twint", etc.
 * }
 *
 * Response:
 * {
 *   type: "payment_page",
 *   url: string,           // Payment page URL to redirect user to
 *   transactionId: number  // Wallee transaction ID
 * }
 */
router.post("/create-payment", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const result = await createWalleeTransaction(req);

    return res.status(STATUS_CODES.OK).json({
      type: result.type,
      url: result.url,
      transactionId: result.transactionId,
      state: result.state,
    });
  } catch (error) {
    console.error("Error while creating Wallee payment:", error);
    res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("WALLEE_CREATE_PAYMENT_ERROR", lang),
    });
  }
});

/**
 * Get payment transaction status
 * GET /api/wallee/get-payment-status?transactionId=123
 *
 * Query params:
 * - transactionId: Wallee transaction ID
 *
 * Response:
 * {
 *   transactionId: number,
 *   state: string,
 *   currency: string,
 *   authorizationAmount: number,
 *   completedOn: date,
 *   failedOn: date,
 *   failureReason: object
 * }
 */
router.get("/get-payment-status", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const transactionStatus = await getWalleeTransactionStatus(req);
    return res.status(STATUS_CODES.OK).json({ data: transactionStatus });
  } catch (error) {
    console.error("Error while getting Wallee payment status:", error);
    res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("WALLEE_PAYMENT_STATUS_ERROR", lang),
    });
  }
});

// NOTE: Webhook endpoint (/api/wallee/webhook) is registered in app.js
// BEFORE bodyParser.json() to receive raw body for signature verification

module.exports = router;
