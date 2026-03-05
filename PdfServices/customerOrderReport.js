const PDFDocument = require("pdfkit");
const User = require("../Models/User");
const EntityDetails = require("../Models/EntityDetails");
const CustomerOrderReport = require("../Models/CustomerOrderReport");
const ItemDetails = require("../Models/ItemDetails");
const {
  uploadBufferToS3,
  generatePresignedUrl,
} = require("../Controller/aws-service");
const { createMail } = require("../Utils/mailer");

const genrateCustomerOrderReport = async (req) => {
  const { userId, entityId, orders, mode = "Online" } = req;

  console.log({ userId, entityId, orders, mode });
  const doc = new PDFDocument({
    size: [595, 842],
    margins: { top: 72, bottom: 0, left: 72, right: 72 },
  });
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

        console.log("User found:", currentUser);

        if (currentUser && currentUser.email) {
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

  const logoPath = "Assets/countr_receipt_logo.png";
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const leftMargin = 25;
  const rightMargin = 20;
  const topMargin = 30;

  const drawHeader = () => {
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
      .text(
        "www.countr-app.ch",
        pageWidth - leftMargin - rightMargin - 130,
        topMargin + 42
      )
      .text(
        "info@countr-app.ch",
        pageWidth - leftMargin - rightMargin - 130,
        topMargin + 56
      );
  };

  let pageNum = 1;
  let isInPageAdded = false;

  doc.on("pageAdded", () => {
    if (isInPageAdded) return; // prevent infinite recursion
    isInPageAdded = true;
    pageNum++;
    drawHeader();
    doc
      .fontSize(10)
      .font("Helveticaneue-Light")
      .fillColor("#888888")
      .text(`Page ${pageNum}`, 0, pageHeight - 30, {
        align: "center",
        width: pageWidth,
      })
      .fillColor("#000000");
    doc.y = topMargin + 90;
    isInPageAdded = false;
  });

  // Page 1 header + footer
  drawHeader();
  doc
    .fontSize(10)
    .font("Helveticaneue-Light")
    .fillColor("#888888")
    .text("Page 1", 0, pageHeight - 30, { align: "center", width: pageWidth })
    .fillColor("#000000");
  doc.y = topMargin + 90;

  const user = await EntityDetails.findOne({ _id: entityId }).populate({
    path: "userId",
    select: "fullName",
    model: "User",
  });
  console.log("User details found:", user);

  doc
    .fontSize(12)
    .font("Helvetica-Bold")
    .text(user?.entityName || "[Restaurant Name]", leftMargin + 12, doc.y + 50)
    .font("Helveticaneue-Light")
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
    .text(
      `Payment Method: ${mode}${
        orders.paymentMethod ? ` (${orders.paymentMethod})` : ""
      }`,
      leftMargin + 12,
      doc.y + 3
    )
    .text(`${currentUser?.email || ""}`, leftMargin + 350, doc.y - 19.5);

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

  const orderItems = orders.items || [];

  for (const orderItem of orderItems) {
    const itemId = orderItem.itemId;
    const quantity = orderItem.quantity || 1;

    let itemName = "[Item name]";
    let itemPrice = 0;

    if (itemId && typeof itemId === "object" && itemId.itemName) {
      itemName = itemId.itemName;
      itemPrice = itemId.price || 0;
    } else if (itemId) {
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

  const platformFees = orders.platformFees || 0;
  const tax = orders.tax || 0;

  if (platformFees > 0) {
    doc
      .fontSize(12)
      .font("Helveticaneue-Light")
      .text("Platform Fee:", leftMargin + 190, doc.y + 20)
      .text(
        `${platformFees.toFixed(2)} CHF`,
        pageWidth - leftMargin - rightMargin - 130,
        doc.y - 14
      );
  }

  doc
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("Total Amount (including tax):", leftMargin + 190, doc.y + 15)
    .text(
      `${(orders.finalAmount || 0).toFixed(2)} CHF`,
      pageWidth - leftMargin - rightMargin - 130,
      doc.y - 16.5
    );

  doc.fillColor("#000000");
  doc.end();

  return await finished;
};

module.exports = { genrateCustomerOrderReport };
