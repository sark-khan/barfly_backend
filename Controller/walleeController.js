const express = require("express");
const router = express.Router();

const {
  createWalleeTransaction,
  getWalleeTransactionStatus,
  handleWalleeWebhook,
  createWalleeOnboardingLink,
  continueWalleeOnboarding,
  checkWalleeAccountStatus,
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

router.post("/webhook", async (req, res) => {
  try {
    const result = await handleWalleeWebhook(req);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(error.status || 500).json({ message: error.message });
  }
});

/**
 * Create merchant onboarding link
 * POST /api/wallee/account-link
 *
 * Request body:
 * {
 *   email: string,        // Merchant email address
 *   platform: string,     // "app" or "web"
 *   entityName: string    // Optional: Merchant/entity name
 * }
 *
 * Response:
 * {
 *   success: true,
 *   url: string,          // Onboarding URL to redirect merchant to
 *   spaceId: number,     // Wallee space ID
 *   applicationUserId: number  // Wallee application user ID
 * }
 */
router.post("/account-link", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await createWalleeOnboardingLink(req);
    return res.status(STATUS_CODES.OK).json(response);
  } catch (error) {
    console.error("Error while creating Wallee onboarding link:", error);
    res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("WALLEE_ONBOARDING_LINK_ERROR", lang),
    });
  }
});

/**
 * Continue/resume merchant onboarding
 * POST /api/wallee/create-onboarding-link-again
 *
 * Request body:
 * {
 *   platform: string     // "app" or "web"
 * }
 *
 * Response:
 * {
 *   success: true,
 *   url: string,          // Onboarding URL
 *   spaceId: number      // Wallee space ID
 * }
 */
router.post("/create-onboarding-link-again", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await continueWalleeOnboarding(req);
    return res.status(STATUS_CODES.OK).json(response);
  } catch (error) {
    console.error("Error while generating Wallee onboarding link:", error);
    res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("WALLEE_ONBOARDING_LINK_ERROR", lang),
    });
  }
});

/**
 * Check merchant account status
 * GET /api/wallee/check-account-status?entityId=xxx
 *
 * Query params:
 * - entityId: Entity ID
 *
 * Response:
 * {
 *   success: true,
 *   hasMissingFields: boolean,
 *   missingFields: string[],
 *   isOnboarded: boolean,
 *   spaceState: string
 * }
 */
router.get("/check-account-status", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await checkWalleeAccountStatus(req);
    return res.status(STATUS_CODES.OK).json(response);
  } catch (error) {
    console.error("Error while checking Wallee account status:", error);
    res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("WALLEE_ACCOUNT_CHECK_ERROR", lang),
    });
  }
});

// NOTE: Webhook endpoint (/api/wallee/webhook) is registered in app.js
// BEFORE bodyParser.json() to receive raw body for signature verification

module.exports = router;
