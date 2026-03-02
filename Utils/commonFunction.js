const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { appClient } = require("../redis");
const SECRET_KEY = "BARFLY@WEBMOB456";
const Event = require("../Models/Event");
const { STATUS, ROLES, STATUS_CODES } = require("./globalConstants");
const Discount = require("../Models/Discount");
const crypto = require("crypto");
const { messaging, messagingPlus } = require("../firebaseAdmin");
const CustomerOrderReport = require("../Models/CustomerOrderReport");
const PDFDocument = require("pdfkit");
const EntityDetails = require("../Models/EntityDetails");
const {
  uploadBufferToS3,
  generatePresignedUrl,
} = require("../Controller/aws-service");
const User = require("../Models/User");
const { getLanguageFromRequest, t } = require("./translator");
const throwError = require("./throwError");
const hashPassword = (password) => {
  return bcrypt.hashSync(password, 10);
};

const comparePassword = async (inputPassword, storedPassword) => {
  return bcrypt.compare(inputPassword, storedPassword);
};

const shiftArrayRight = (arr) => {
  // Check if the array is not empty
  if (arr.length === 0) return arr;

  // Remove the last element and store it
  const lastElement = arr.pop();

  // Insert the last element at the beginning of the array
  arr.unshift(lastElement);

  return arr;
};

const getJwtToken = (user, isUser = false) => {
  let payload = {
    id: user._id,
    userId: user._id,
    role: user.role,
    email: user.email,
    contactNumber: user.contactNumber,
    isAdmin: user.isAdmin === true,
    countrTag: user.countrTag,
  };
  if (!isUser) {
    payload = {
      ...payload,
      entityName: user.entityDetails.entityName,
      entityType: user.entityDetails.entityType,
      entityId: user.entityDetails._id,
    };
  }
  return jwt.sign(payload, SECRET_KEY);
};

const performEndOfDayTask = async () => {
  try {
    const today = new Date();
    today.setUTCDate(today.getUTCDate());
    const startOfDay = new Date(today);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date(today);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const pipeline = [
      {
        $match: {
          $and: [
            { from: { $gte: startOfDay } },
            { to: { $lte: endOfDay } },
            { entityId: { $exists: true } },
          ],
        },
      },
      {
        $lookup: {
          from: "entitydetails",
          localField: "entityId",
          foreignField: "_id",
          as: "entityDetails",
        },
      },
      {
        $unwind: "$entityDetails",
      },
      {
        $project: {
          _id: "$entityId",
          entityDetails: {
            _id: 1,
            city: 1,
            street: 1,
            entityName: 1,
            entityType: 1,
          },
          event: {
            _id: "$_id",
            locationName: "$locationName",
            eventName: "$eventName",
            date: "$date",
            from: "$from",
            to: "$to",
            insiders: "$insiders",
            ageLimit: "$ageLimit",
            ownerId: "$ownerId",
          },
        },
      },
    ];

    const entityDataList = await Event.aggregate(pipeline).exec();

    if (entityDataList.length) {
      await appClient
        .set("LIVE_ENTITY", JSON.stringify(entityDataList))
        .catch((error) => console.error(error));
    }
  } catch (error) {
    console.error("Error performing end of day task:", error);
  }
};

const haversineDistance = async (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// async function sendFirebaseNotification(token, title, body) {
//   const message = {
//     notification: { title, body },
//     token: token,
//   };

//   try {
//     const response = await admin.messaging().send(message);
//     console.log("Successfully sent notification:", response);
//   } catch (error) {
//     console.error("Error sending notification:", error);
//   }
// }

const validateCoupon = async (couponCode, totalAmount) => {
  if (!couponCode) return { discountAmount: 0 };

  const discount = await Discount.findOne({
    code: couponCode,
    status: STATUS.ACTIVE,
  });
  if (!discount) {
    throw new Error("Invalid or expired coupon");
  }

  const currentDate = new Date();

  if (currentDate < discount.startDate || currentDate > discount.endDate) {
    throw new Error("Coupon is not valid at this time");
  }

  // if (discount.usedCount >= discount.usageLimit) {
  //   throw new Error("Coupon usage limit reached");
  // }

  // if (totalAmount < discount.minAmount) {
  //   throw new Error(`Minimum order amount should be ${discount.minAmount}`);
  // }

  let discountAmount = 0;

  if (discount.type === "percentage") {
    discountAmount = (totalAmount * discount.value) / 100;
    // if (discount.maxDiscount) {
    //   discountAmount = Math.min(discountAmount, discount.maxDiscount);
    // }
  } else if (discount.type === "fixed") {
    discountAmount = discount.value;
  }

  return { discountAmount, couponCode };
};

const algorithm = "aes-256-cbc";
const secretKey = process.env.SECRET_KEY || "8b970064a0ba362dceae1c279aa6cbb4";
const iv = crypto.randomBytes(16);

// Function to encrypt data
const encrypt = (text) => {
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(secretKey), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
};

// Function to decrypt data
const decrypt = (encryptedText) => {
  const [ivHex, encrypted] = encryptedText.split(":");
  const decipher = crypto.createDecipheriv(
    algorithm,
    Buffer.from(secretKey),
    Buffer.from(ivHex, "hex")
  );
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// const sendFirebaseNotification = async ({
//   isOwner = false,
//   titleText = "",
//   body = "",
//   data = {},
//   ownerToken = "",
//   customerToken = "",
//   isCustomer = false,
//   showNotification = false,
//   topic = "",
// }) => {
//   try {
//     if (token == "") {
//       console.error("No fcm token found");
//       return;
//     }
//     const payload = {
//       token: ownerToken,
//       data: data,
//     };

//     if (showNotification) {
//       payload.notification = {
//         title: titleText,
//         body: body,
//       };

//       payload.android = {
//         priority: "high",
//         notification: {
//           click_action: "FLUTTER_NOTIFICATION_CLICK",
//         },
//       };

//       payload.apns = {
//         payload: {
//           aps: {
//             alert: {
//               title: titleText,
//               body: body,
//             },
//             category: "FLUTTER_NOTIFICATION_CLICK",
//             mutableContent: 1,
//             content_available: true,
//           },
//         },
//       };
//     } else {
//       payload.android = {
//         priority: "high",
//       };

//       payload.apns = {
//         headers: {
//           "apns-priority": "5",
//         },
//         payload: {
//           aps: {
//             contentAvailable: true,
//           },
//         },
//       };
//     }
//     if (isOwner) {
//       await messagingPlus.send(payload);
//       console.info("Notification Pushed for admin");
//     } else if (isCustomer) {
//       payload.token = customerToken;
//       await messaging.send(payload);
//       console.info("Notifiaction pushed for customer");
//     }
//   } catch (err) {
//     console.error("Push Notification Error:", err.message);

//     if (
//       err.code === "messaging/invalid-argument" ||
//       err.code === "messaging/registration-token-not-registered" ||
//       err.code === "messaging/invalid-recipient"
//     ) {
//       // Remove invalid token from user
//       await User.updateOne(
//         { _id: entityDetails.userId },
//         { $unset: { fcmToken: "" } }
//       );
//     }
//   }
// };

const sendFirebaseNotification = async ({
  title = "",
  body = "",
  data = {},
  topic = "",
  showNotification = true,
}) => {
  try {
    if (!topic) {
      console.warn("⚠️ No topic provided for notification.");
      return;
    }

    // Keep user_ and entity_ topics as-is, only prefix others with entity_
    // const topicName = topic.startsWith("entity_") || topic.startsWith("user_") ? topic : `entity_${topic}`;

    const payload = {
      notification: showNotification
        ? {
            title,
            body,
          }
        : undefined,

      data: {
        ...data,
        click_action: "FLUTTER_NOTIFICATION_CLICK",
      },

      android: {
        priority: "high",
        notification: showNotification
          ? {
              click_action: "FLUTTER_NOTIFICATION_CLICK",
            }
          : undefined,
      },

      apns: showNotification
        ? {
            headers: {
              "apns-priority": "10",
            },
            payload: {
              aps: {
                alert: {
                  title,
                  body,
                },
                category: "FLUTTER_NOTIFICATION_CLICK",
                mutableContent: 1,
                content_available: true,
              },
            },
          }
        : {
            headers: {
              "apns-push-type": "background",
              "apns-priority": "5",
            },
            payload: {
              aps: {
                "content-available": 1,
              },
            },
          },
      topic: topic,
    };

    await messagingPlus.send(payload);
    await messaging.send(payload);
    console.info(`✅ Notification sent to topic: ${topic}`);
  } catch (err) {
    console.error("❌ Push Notification Error:", err.message);
  }
};

const genrateCustomerOrderReport = async (req) => {
  const { userId, entityId, orders, mode = "Online" } = req;

  console.log({ userId, entityId, orders, mode });
  const doc = new PDFDocument({ size: [595, 842] });
  const buffers = [];
  const currentUser = await User.findById(userId).select("email fullName");

  doc.on("data", (chunk) => buffers.push(chunk));
  const finished = new Promise((resolve, reject) => {
    doc.on("end", async () => {
      try {
        const pdfBuffer = Buffer.concat(buffers);
        const timestamp = Date.now();
        const fileKey = `orders/${userId}/order_report_${timestamp}.pdf`;
        const filename = `order_report_${timestamp}.pdf`;

        const s3Upload = await uploadBufferToS3(pdfBuffer, fileKey);
        const signedUrl = generatePresignedUrl(fileKey);
        console.log("PDF uploaded to S3:", signedUrl);

        await CustomerOrderReport.create({
          userId,
          entityId,
          date: new Date(),
          filename: filename,
          filePath: s3Upload.Location,
        });

        // Get user's email to send the PDF
        const { createMail } = require("./mailer");

        console.log("User found:", currentUser);

        if (currentUser && currentUser.email) {
          // Send email with PDF attachment
          const mailData = {
            to: currentUser.email,
            subject: "Your Order Report",
            text: `Dear ${
              currentUser.fullName || "Customer"
            },\n\nPlease find your order report attached.\n\nThank you for using our service!\n\nBest regards,\nCountr App Team`,
            attachments: [
              {
                filename: filename,
                content: pdfBuffer,
                contentType: "application/pdf",
              },
            ],
          };

          try {
            const emailResult = await createMail(mailData);
            if (emailResult) {
              console.log(
                `✅ Order report email sent successfully to: ${currentUser.email}`
              );
            } else {
              console.warn(
                `⚠️ Failed to send email to: ${currentUser.email}, but PDF was generated successfully`
              );
            }
          } catch (emailError) {
            console.error(
              "❌ Error sending order report email:",
              emailError.message
            );
            console.warn(
              "⚠️ Email failed but PDF generation completed successfully"
            );
            // Don't throw error - PDF generation should still succeed
          }
        } else {
          console.warn("⚠️ User email not found, skipping email notification");
          console.log(
            "📄 PDF generated successfully without email notification"
          );
        }

        resolve(signedUrl);
      } catch (uploadError) {
        console.error("S3 or DB error:", uploadError);
        reject(uploadError);
      }
    });

    doc.on("error", reject);
  });

  doc.registerFont(
    "Helveticaneue-Light",
    "Assets/fonts/HelveticaNeueLight.otf"
  );
  doc.registerFont(
    "Helveticaneue-Medium",
    "Assets/fonts/HelveticaNeueMedium.otf"
  );
  doc.registerFont(
    "Helveticaneue-Regular",
    "Assets/fonts/HelveticaNeue Regular.ttf"
  );

  const logoPath = "Assets/countr_logo.png";
  const pageWidth = doc.page.width;
  const leftMargin = 25;
  const rightMargin = 20;
  const topMargin = 30;

  doc.image(logoPath, leftMargin, topMargin, { width: 250, height: 70 });

  doc
    .fontSize(12)
    .font("Helvetica-Bold")
    .text(
      "countr app",
      pageWidth - leftMargin - rightMargin - 130,
      topMargin + 25
    )
    .fontSize(11)
    .font("Helveticaneue-Light")
    .text("www.countr-app.ch", pageWidth - leftMargin - rightMargin - 130)
    .text("info@countr-app.ch", pageWidth - leftMargin - rightMargin - 130);

  const user = await EntityDetails.findOne({ _id: entityId }).populate({
    path: "userId",
    select: "fullName",
    model: "User",
  });
  console.log("User details found:", user);

  // Generate date range for the report
  const currentDate = new Date();
  const fromDate = currentDate.toLocaleDateString();
  const toDate = currentDate.toLocaleDateString();

  doc
    .fontSize(12)
    .font("Helvetica-Bold")
    .text(user?.entityName || "[Restaurant Name]", leftMargin + 12, doc.y + 50)
    .font("Helveticaneue-Light")
    .text(
      currentUser?.fullName || "[Account Owner Name]",
      leftMargin + 12,
      doc.y + 4
    )
    .text(
      `${user?.zipcode || "ZIP"} ${user?.city || "City"}`,
      leftMargin + 12,
      doc.y + 4
    );

  doc
    .fontSize(12)
    .font("Helveticaneue-Light")
    .text(
      `${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
      leftMargin + 12,
      doc.y + 30
    )
    .fontSize(12)
    .text(`Zahlungsmethode: ${mode}`, leftMargin + 12, doc.y + 3)
    .text(`${currentUser.email}`, leftMargin + 350, doc.y - 19.5);

  doc
    .moveTo(leftMargin + 12, doc.y + 20)
    .lineTo(pageWidth - rightMargin - 40, doc.y + 20)
    .lineWidth(1)
    .strokeColor("#000000")
    .stroke();

  doc
    .fontSize(12)
    .font("Helvetica-Bold")
    .text("Quantity", leftMargin + 12, doc.y + 40)
    .text("Item name", leftMargin + 150, doc.y - 15)
    .text("Item price", leftMargin + 250, doc.y - 15)
    .text(
      "Total Price[CHF]",
      pageWidth - leftMargin - rightMargin - 130,
      doc.y - 15
    );

  const totalAmount = orders.totalAmount || orders.finalAmount || 0;

  // Handle both regular orders and offline orders
  const orderItems = orders.items || [];

  for (const orderItem of orderItems) {
    // Get item details - handle both populated and non-populated cases
    const itemId = orderItem.itemId;
    const quantity = orderItem.quantity || 1;

    // For PDF generation, we need to fetch item details if not populated
    let itemName = "[Item name]";
    let itemPrice = 0;

    if (itemId && typeof itemId === "object" && itemId.itemName) {
      // Item is populated
      itemName = itemId.itemName;
      itemPrice = itemId.price || 0;
    } else if (itemId) {
      // Item is not populated, need to fetch
      const ItemDetails = require("../Models/ItemDetails");
      try {
        const item = await ItemDetails.findById(itemId).select(
          "itemName price"
        );
        if (item) {
          itemName = item.itemName;
          itemPrice = item.price || 0;
        }
      } catch (error) {
        console.error("Error fetching item details:", error);
      }
    }

    const itemTotal = (itemPrice * quantity).toFixed(2);

    doc
      .fontSize(12)
      .font("Helveticaneue-Light")
      .text(quantity.toString(), leftMargin + 12, doc.y + 20)
      .text(itemName, leftMargin + 150, doc.y - 15)
      .text(`${itemPrice.toFixed(2)}`, leftMargin + 250, doc.y - 12)
      .text(itemTotal, pageWidth - leftMargin - rightMargin - 130, doc.y - 14);
  }

  // Add total amount at the bottom
  doc
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("Total Amount (including fees):", leftMargin + 190, doc.y + 30)
    .text(
      `${orders.finalAmount.toFixed(2)} CHF`,
      pageWidth - leftMargin - rightMargin - 130,
      doc.y - 16.5
    );

  doc.fillColor("#000000");
  doc.end(); // triggers the 'end' event

  return await finished;
};
const verifyTokenWithoutResponse = async (req) => {
  const token = req.headers["token"];
  const lang = getLanguageFromRequest(req);

  if (!token) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: t("AUTH_TOKEN_MISSING", lang),
    });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.id = decoded.id;
    req.userId = decoded.userId;
    req.role = decoded.role;
    req.email = decoded.email;
    req.entityName = decoded.entityName;
    req.entityId = decoded.entityId;
    req.entityType = decoded.entityType;
    req.isAdmin = decoded.role === ROLES.ADMIN || decoded.isAdmin === true;
    req.countrTag = decoded.countrTag;

    // Skip Redis check for admins (they use Admin model)
    if (!req.isAdmin) {
      const redisClient = require("../redis");
      const { KEY_TYPE_PREFIXES } = require("./globalConstants");
      const redisKey = `${KEY_TYPE_PREFIXES.USER_TOKEN}:${decoded.userId}`;
      const sessionExists = await redisClient.get(redisKey);
      if (!sessionExists) {
        throwError({
          status: STATUS_CODES.NOT_AUTHORIZED,
          message: t("USER_ACCOUNT_BLOCKED", lang),
        });
      }
    }
  } catch (err) {
    if (err.status) throw err;
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: t("AUTH_TOKEN_INVALID", lang),
    });
  }
};
module.exports = {
  hashPassword,
  comparePassword,
  getJwtToken,
  sendFirebaseNotification,
  // generateOTP,
  genrateCustomerOrderReport,
  SECRET_KEY,
  sleep,
  performEndOfDayTask,
  shiftArrayRight,
  haversineDistance,
  sendFirebaseNotification,
  validateCoupon,
  encrypt,
  decrypt,
  verifyTokenWithoutResponse,
};
