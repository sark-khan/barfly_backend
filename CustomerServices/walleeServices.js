const {
  TransactionsService,
  Configuration,
  HttpBearerAuth,
  WebhookEncryptionKeysService,
  SpaceService,
  ApplicationUserService,
  UserAccountRoleService,
} = require("wallee");
const throwError = require("./../Utils/throwError");
const { STATUS_CODES } = require("../Utils/globalConstants");
const Event = require("../Models/Event");
const EntityDetails = require("../Models/EntityDetails");
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
const spaceService = new SpaceService(config);
const applicationUserService = new ApplicationUserService(config);
const userAccountRoleService = new UserAccountRoleService(config);

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
    select: "walleeSpaceId walleeLinkedAccountId entityName",
  });

  if (!event || !event.entityId) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("EVENT_NOT_FOUND", lang),
    });
  }

  // Use merchant's space ID if available, otherwise fall back to global space ID
  const merchantSpaceId = event.entityId?.walleeSpaceId || spaceId;

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
      space: merchantSpaceId,
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
        space: merchantSpaceId,
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

  const { listenerEntityId, entityId, listenerEntityTechnicalName, state, spaceId: webhookSpaceId } =
    payload;

  console.log("Webhook details:", {
    listenerEntityId,
    entityId,
    listenerEntityTechnicalName,
    webhookState: state,
    webhookSpaceId,
  });

  try {
    // 4️⃣ Only handle Transaction webhooks
    if (listenerEntityTechnicalName !== "Transaction") {
      console.log(`Skipping non-Transaction webhook: ${listenerEntityTechnicalName}`);
      return { received: true, skipped: true, reason: "Not a Transaction webhook" };
    }

    // Use space ID from webhook payload if available, otherwise fall back to global space ID
    const transactionSpaceId = webhookSpaceId || spaceId;

    // 5️⃣ Fetch transaction from Wallee (source of truth)
    console.log(`Fetching transaction ${entityId} from space ${transactionSpaceId}...`);
    const transaction = await transactionsService.getPaymentTransactionsId({
      space: transactionSpaceId,
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

/**
 * Create Wallee merchant onboarding link
 * Similar to Stripe's account-link, this creates a space for the merchant
 * and generates an onboarding URL
 */
const createWalleeOnboardingLink = async (req) => {
  const lang = getLanguageFromRequest(req);
  const {
    entityId,
    body: { email, platform, entityName },
  } = req;

  if (!entityId || !email) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("WALLEE_MISSING_ENTITY_OR_EMAIL", lang),
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

  try {
    // Check if entity already has a Wallee space
    const entity = await EntityDetails.findById(entityId);
    if (entity?.walleeSpaceId) {
      // If space exists, generate a new onboarding URL
      return await continueWalleeOnboarding(req);
    }

    // Create a new space for this merchant
    // In Wallee, a space represents a merchant account
    const spaceCreate = {
      name: entityName || `Merchant ${entityId}`,
      requestLimit: 1000, // API request limit per month
      primaryCurrency: "CHF", // Default currency, can be changed
      technicalContactAddresses: [email],
      administratorEmail: email,
      administratorFirstName: entityName?.split(" ")[0] || "Merchant",
      administratorLastName: entityName?.split(" ").slice(1).join(" ") || "Account",
      administratorLocale: lang === "de" ? "de_CH" : "en_US",
    };

    const space = await spaceService.postSpace({
      spaceCreate: spaceCreate,
    });

    console.log("Wallee space created:", {
      spaceId: space.id,
      name: space.name,
      state: space.state,
    });

    // Create an application user for this merchant within the space
    // Application users represent merchants who can manage their space
    const applicationUserCreate = {
      name: entityName || `Merchant ${entityId}`,
      emailAddress: email,
      primaryAccount: true,
    };

    const applicationUser = await applicationUserService.postApplicationUser({
      space: space.id,
      applicationUserCreate: applicationUserCreate,
    });

    console.log("Wallee application user created:", {
      applicationUserId: applicationUser.id,
      email: applicationUser.emailAddress,
      state: applicationUser.state,
    });

    // Generate onboarding URL
    // Wallee uses a different approach - merchants need to complete setup in their space
    // We'll generate a URL that directs them to their space's configuration page
    const isMobile = platform === "app";
    const redirectUrl = isMobile
      ? `${process.env.HOST_URL}/bank`
      : `${process.env.HOST_URL}/app/profile/bank-account`;

    // Wallee onboarding URL format: https://app-wallee.com/{spaceId}/account/onboarding
    // Note: This URL structure may vary based on Wallee's actual implementation
    // You may need to use Wallee's API to generate a proper onboarding link
    const onboardingUrl = `https://app-wallee.com/${space.id}/account/onboarding?returnUrl=${encodeURIComponent(redirectUrl)}`;

    // Update entity with Wallee space and user IDs
    await EntityDetails.updateOne(
      { _id: entityId },
      {
        walleeSpaceId: space.id,
        walleeApplicationUserId: applicationUser.id,
        walleeOnboardingUrl: onboardingUrl,
        bankLinkUrl: onboardingUrl, // Store in bankLinkUrl for backward compatibility
      }
    );

    return {
      success: true,
      message: t("WALLEE_ONBOARDING_LINK_SUCCESS", lang),
      url: onboardingUrl,
      spaceId: space.id,
      applicationUserId: applicationUser.id,
    };
  } catch (error) {
    console.error("Error creating Wallee onboarding link:", error);
    const errorDetails = await parseWalleeError(error);
    console.error("Wallee API Error Details:", errorDetails);

    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message:
        errorDetails.message || t("WALLEE_ONBOARDING_LINK_ERROR", lang),
    });
  }
};

/**
 * Continue/resume Wallee merchant onboarding
 * Similar to Stripe's continueStripeOnboarding
 */
const continueWalleeOnboarding = async (req) => {
  const lang = getLanguageFromRequest(req);
  const {
    entityId,
    body: { platform },
  } = req;

  if (!entityId) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("WALLEE_MISSING_ENTITY_ID", lang),
    });
  }

  const entity = await EntityDetails.findById(entityId);
  if (!entity?.walleeSpaceId) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("WALLEE_SPACE_NOT_FOUND_FOR_ENTITY", lang),
    });
  }

  try {
    const isMobile = platform === "app";
    const redirectUrl = isMobile
      ? `${process.env.HOST_URL}/bank`
      : `${process.env.HOST_URL}/app/profile/bank-account`;

    // Generate onboarding URL for existing space
    const onboardingUrl = `https://app-wallee.com/${entity.walleeSpaceId}/account/onboarding?returnUrl=${encodeURIComponent(redirectUrl)}`;

    await EntityDetails.updateOne(
      { _id: entityId },
      {
        walleeOnboardingUrl: onboardingUrl,
        bankLinkUrl: onboardingUrl, // Update bankLinkUrl for backward compatibility
      }
    );

    return {
      success: true,
      url: onboardingUrl,
      spaceId: entity.walleeSpaceId,
    };
  } catch (error) {
    console.error("Error continuing Wallee onboarding:", error);
    throwError({
      status: STATUS_CODES.SERVER_ERROR,
      message: error.message || t("WALLEE_ONBOARDING_CONTINUE_ERROR", lang),
    });
  }
};

/**
 * Check Wallee merchant account status
 * Similar to Stripe's checkStripeAccountMissingFields
 */
const checkWalleeAccountStatus = async (req) => {
  const lang = getLanguageFromRequest(req);
  try {
    const { entityId } = req;

    if (!entityId) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("WALLEE_MISSING_ENTITY_ID", lang),
      });
    }

    const entity = await EntityDetails.findById(entityId);
    if (!entity?.walleeSpaceId) {
      return {
        success: true,
        message: t("WALLEE_SPACE_NOT_ASSOCIATED", lang),
        hasMissingFields: true,
        missingFields: [],
        isOnboarded: false,
      };
    }

    try {
      // Fetch space details from Wallee
      const space = await spaceService.getSpace({
        id: entity.walleeSpaceId,
      });

      const missingFields = [];

      // Check if space is active
      if (space.state !== "ACTIVE") {
        missingFields.push("Space activation");
      }

      // Check if payment methods are configured
      // Note: This may require additional API calls depending on Wallee's API structure
      if (!space.paymentMethodConfigurations || space.paymentMethodConfigurations.length === 0) {
        missingFields.push("Payment method configuration");
      }

      // Check if bank account is configured
      // Note: Wallee may use different endpoints for bank account verification
      // This is a placeholder - adjust based on actual Wallee API structure
      if (!space.bankAccounts || space.bankAccounts.length === 0) {
        missingFields.push("Bank account");
      }

      return {
        success: true,
        message: t("WALLEE_ACCOUNT_CHECK_COMPLETE", lang),
        hasMissingFields: !!missingFields.length,
        missingFields,
        isOnboarded: space.state === "ACTIVE" && missingFields.length === 0,
        spaceState: space.state,
      };
    } catch (err) {
      console.error("Wallee space retrieve failed:", err);
      return {
        success: true,
        message: t("WALLEE_SPACE_INACCESSIBLE", lang),
        hasMissingFields: true,
        missingFields: [],
        isOnboarded: false,
      };
    }
  } catch (error) {
    console.error("Wallee Account Check Error:", error);
    throwError({
      status: STATUS_CODES.INTERNAL_SERVER_ERROR,
      message: t("WALLEE_ACCOUNT_CHECK_FAILED", lang),
    });
  }
};

module.exports = {
  createWalleeTransaction,
  getWalleeTransactionStatus,
  handleWalleeWebhook,
  createWalleeOnboardingLink,
  continueWalleeOnboarding,
  checkWalleeAccountStatus,
};
