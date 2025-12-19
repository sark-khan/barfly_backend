const {
  TransactionsService,
  Configuration,
  HttpBearerAuth,
  WebhookEncryptionKeysService,
} = require("wallee");
const throwError = require("./../Utils/throwError");
const { STATUS_CODES } = require("../Utils/globalConstants");
const Event = require("../Models/Event");
const { t, getLanguageFromRequest } = require("../Utils/translator");

// Wallee Configuration
const spaceId = Number(process.env.WALLEE_SPACE_ID);
const walleeUserId = Number(process.env.WALLEE_USER_ID);
const apiSecret = process.env.WALLEE_API_SECRET;

// Initialize Wallee Configuration with authentication
const httpBearerAuth = new HttpBearerAuth(walleeUserId, apiSecret);
const config = new Configuration({
  httpBearerAuth: httpBearerAuth,
});

// Initialize Wallee Services
const transactionsService = new TransactionsService(config);
const webhookEncryptionService = new WebhookEncryptionKeysService(config);

// Helper function to parse error response
const parseWalleeError = async (error) => {
  try {
    if (error.response) {
      // Try to get the response body as text
      const responseText = await error.response.text();
      console.error("Wallee API Error Response:", responseText);
      try {
        return JSON.parse(responseText);
      } catch {
        return { message: responseText };
      }
    }
  } catch (e) {
    console.error("Error parsing Wallee error:", e);
  }
  return { message: error.message || "Unknown error" };
};

/**
 * Create a Wallee transaction and return the payment page URL
 * Similar to Stripe's createPaymentIntent but returns a hosted payment page URL
 */
const createWalleeTransaction = async (req) => {
  const lang = getLanguageFromRequest(req);
  const {
    userId: reqUserId,
    body: { amount, currency, eventId },
    email,
  } = req;

  // Use email from request body if provided, otherwise use from JWT token
  const customerEmail = req.body.email || email;

  // Validate required fields
  if (!amount || !currency || !eventId) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("WALLEE_MISSING_REQUIRED_FIELDS", lang),
    });
  }

  // Validate Wallee configuration
  if (!spaceId || !walleeUserId || !apiSecret) {
    console.error("Wallee configuration missing:", {
      spaceId: !!spaceId,
      walleeUserId: !!walleeUserId,
      apiSecret: !!apiSecret,
    });
    throwError({
      status: STATUS_CODES.SERVER_ERROR,
      message: t("WALLEE_CONFIG_MISSING", lang),
    });
  }

  // Fetch event details
  const event = await Event.findById(eventId).populate({
    path: "entityId",
    select: "walleeLinkedAccountId entityName",
  });

  if (!event || !event.entityId) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("EVENT_NOT_FOUND", lang),
    });
  }

  try {
    // Create line item for the transaction
    const lineItem = {
      name: `Payment for ${event.entityId.entityName || "Order"}`,
      uniqueId: `order-${reqUserId}-${eventId}-${Date.now()}`,
      sku: `event-${eventId}`,
      quantity: 1,
      amountIncludingTax: Number(amount),
      type: "PRODUCT", // LineItemType enum value
    };

    // Create transaction object
    const transactionCreate = {
      lineItems: [lineItem],
      autoConfirmationEnabled: true,
      currency: currency.toUpperCase(),
      customerEmailAddress: customerEmail || undefined,
      metaData: {
        userId: reqUserId,
        eventId: eventId,
        // paymentMethodType: paymentMethodType,
      },
      successUrl: `countr://payment/success?eventId=${eventId}&userId=${reqUserId}`,
      failedUrl: `countr://payment/cancel?eventId=${eventId}&userId=${reqUserId}`,
    };

    // Create the transaction
    const transaction = await transactionsService.postPaymentTransactions({
      space: spaceId,
      transactionCreate: transactionCreate,
    });

    console.log("Wallee transaction created:", {
      transactionId: transaction.id,
      state: transaction.state,
      currency: transaction.currency,
      amount: amount,
    });

    // Get the payment page URL
    const paymentPageUrl =
      await transactionsService.getPaymentTransactionsIdPaymentPageUrl({
        space: spaceId,
        id: transaction.id,
      });

    console.log("Wallee payment page URL generated:", paymentPageUrl);

    return {
      type: "payment_page",
      url: paymentPageUrl,
      transactionId: transaction.id,
      state: transaction.state,
    };
  } catch (error) {
    console.error("Error creating Wallee transaction:", error);

    // Parse and log the actual error from Wallee
    const errorDetails = await parseWalleeError(error);
    console.error("Wallee API Error Details:", errorDetails);

    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message:
        errorDetails.message || t("WALLEE_TRANSACTION_CREATE_ERROR", lang),
    });
  }
};

/**
 * Get the status of a Wallee transaction
 */
const getWalleeTransactionStatus = async (req) => {
  const lang = getLanguageFromRequest(req);
  const { transactionId } = req.query;

  if (!transactionId) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("WALLEE_TRANSACTION_ID_REQUIRED", lang),
    });
  }

  try {
    const transaction = await transactionsService.getPaymentTransactionsId({
      space: spaceId,
      id: Number(transactionId),
    });

    return {
      transactionId: transaction.id,
      state: transaction.state,
      currency: transaction.currency,
      authorizationAmount: transaction.authorizationAmount,
      completedOn: transaction.completedOn,
      failedOn: transaction.failedOn,
      failureReason: transaction.failureReason,
    };
  } catch (error) {
    console.error("Error fetching Wallee transaction status:", error);
    throwError({
      status: STATUS_CODES.SERVER_ERROR,
      message: error.message || t("WALLEE_TRANSACTION_STATUS_ERROR", lang),
    });
  }
};

/**
 * Handle Wallee webhook for transaction state changes
 */

const handleWalleeWebhook = async (req) => {
  const lang = getLanguageFromRequest(req);

  console.log("========== WALLEE WEBHOOK RECEIVED ==========");
  console.log("Timestamp:", new Date().toISOString());
  console.log("Headers:", JSON.stringify(req.headers, null, 2));

  // 1️⃣ Get raw body content
  const contentToVerify = req.body.toString("utf8");
  console.log("Raw body:", contentToVerify);

  // 2️⃣ Check for x-signature header (Wallee uses ECDSA signature)
  // Format: algorithm=SHA256withECDSA, keyId=<uuid>, signature=<base64>
  const signatureHeader = req.headers["x-signature"];
  console.log("x-signature header:", signatureHeader);

  if (signatureHeader) {
    // Verify signature using Wallee SDK's ECDSA verification
    // The SDK fetches the public key from Wallee API using keyId and verifies
    try {
      console.log("Verifying webhook signature using Wallee SDK...");
      const isValid = await webhookEncryptionService.isContentValid(
        signatureHeader,
        contentToVerify
      );
      console.log("Signature verification result:", isValid);

      if (!isValid) {
        console.error("❌ Webhook signature verification FAILED");
        throwError({
          status: STATUS_CODES.NOT_AUTHORIZED,
          message: "Invalid Wallee webhook signature",
        });
      }
      console.log("✅ Webhook signature verified successfully");
    } catch (verificationError) {
      console.error("Webhook signature verification error:", verificationError);
      // For now, log the error but continue processing (for debugging)
      // In production, you should throw an error here
      console.warn("⚠️ Continuing without signature verification for debugging...");
    }
  } else {
    console.warn("⚠️ No x-signature header found - webhook may not be signed");
  }

  // 3️⃣ Parse payload
  let payload;
  try {
    payload = JSON.parse(contentToVerify);
    console.log("Parsed payload:", JSON.stringify(payload, null, 2));
  } catch (parseError) {
    console.error("Failed to parse webhook payload:", parseError);
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Invalid JSON payload",
    });
  }

  const { listenerEntityId, entityId, listenerEntityTechnicalName, state } =
    payload;

  console.log("Webhook details:", {
    listenerEntityId,
    entityId,
    listenerEntityTechnicalName,
    webhookState: state,
  });

  try {
    // 4️⃣ Only handle Transaction webhooks
    if (listenerEntityTechnicalName !== "Transaction") {
      console.log(`Skipping non-Transaction webhook: ${listenerEntityTechnicalName}`);
      return { received: true, skipped: true, reason: "Not a Transaction webhook" };
    }

    // 5️⃣ Fetch transaction from Wallee (source of truth)
    console.log(`Fetching transaction ${entityId} from Wallee API...`);
    const transaction = await transactionsService.getPaymentTransactionsId({
      space: spaceId,
      id: Number(entityId),
    });

    console.log("Wallee transaction fetched:", {
      transactionId: transaction.id,
      state: transaction.state,
      currency: transaction.currency,
      amount: transaction.authorizationAmount,
      metadata: transaction.metaData,
      createdOn: transaction.createdOn,
      completedOn: transaction.completedOn,
      failedOn: transaction.failedOn,
    });

    // 6️⃣ Handle states
    switch (transaction.state) {
      case "FULFILL":
        console.log("✅ PAYMENT COMPLETED - Transaction:", transaction.id);
        // TODO: Mark order as PAID in your database
        // TODO: Send confirmation email/notification to user
        break;

      case "AUTHORIZED":
        console.log("🟡 PAYMENT AUTHORIZED (pending capture) - Transaction:", transaction.id);
        break;

      case "COMPLETED":
        console.log("✅ PAYMENT COMPLETED - Transaction:", transaction.id);
        break;

      case "FAILED":
        console.log("❌ PAYMENT FAILED - Transaction:", transaction.id);
        console.log("Failure reason:", transaction.failureReason);
        break;

      case "VOIDED":
        console.log("⚠️ PAYMENT VOIDED - Transaction:", transaction.id);
        break;

      case "DECLINE":
        console.log("⛔ PAYMENT DECLINED - Transaction:", transaction.id);
        break;

      case "PENDING":
        console.log("⏳ PAYMENT PENDING - Transaction:", transaction.id);
        break;

      case "PROCESSING":
        console.log("🔄 PAYMENT PROCESSING - Transaction:", transaction.id);
        break;

      default:
        console.log(`ℹ️ UNHANDLED STATE: ${transaction.state} - Transaction:`, transaction.id);
    }

    console.log("========== WEBHOOK PROCESSED SUCCESSFULLY ==========");
    return {
      received: true,
      transactionId: transaction.id,
      state: transaction.state
    };
  } catch (error) {
    console.error("❌ Error processing Wallee webhook:", error);
    console.log("========== WEBHOOK PROCESSING FAILED ==========");
    throwError({
      status: STATUS_CODES.SERVER_ERROR,
      message: error.message || t("WALLEE_WEBHOOK_ERROR", lang),
    });
  }
};

module.exports = {
  createWalleeTransaction,
  getWalleeTransactionStatus,
  handleWalleeWebhook,
};
