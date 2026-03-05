const PDFDocument = require("pdfkit");

const { ORDER_STATUS, STATUS_CODES } = require("../Utils/globalConstants");
const Order = require("../Models/Order");
const Counter = require("../Models/Counter");
const EntityDetails = require("../Models/EntityDetails");
const {
  uploadBufferToS3,
  generatePresignedUrl,
} = require("../Controller/aws-service");
const SalesReport = require("../Models/SalesReport");
const ItemDetails = require("../Models/ItemDetails");

module.exports.ownerTrades = async (req) => {
  const {
    userId,
    entityId,
    query: { fromDate, toDate },
  } = req;

  const start = new Date(fromDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(toDate);
  end.setHours(23, 59, 59, 999);

  const payload = { status: ORDER_STATUS.COMPLETED };
  const doc = new PDFDocument({ size: [595, 842] });
  const buffers = [];

  doc.on("data", (chunk) => buffers.push(chunk));

  const finished = new Promise((resolve, reject) => {
    doc.on("end", async () => {
      try {
        const pdfBuffer = Buffer.concat(buffers);
        const timestamp = Date.now();
        const fileKey = `reports/${userId}/owner_trades_${timestamp}.pdf`;

        const s3Upload = await uploadBufferToS3(pdfBuffer, fileKey);
        const signedUrl = await generatePresignedUrl(fileKey);

        await SalesReport.create({
          userId,
          entityId,
          fromDate,
          toDate,
          filename: `owner_trades_${timestamp}.pdf`,
          filePath: s3Upload.Location,
        });

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
      .text("www.countr-app.ch", pageWidth - leftMargin - rightMargin - 130)
      .text("info@countr-app.ch", pageWidth - leftMargin - rightMargin - 130);
  };

  let pageNum = 1;

  // Draw header + page number on every new page
  doc.on("pageAdded", () => {
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
    doc.moveDown(5);
  });

  // Draw header + page 1 footer
  drawHeader();
  doc
    .fontSize(10)
    .font("Helveticaneue-Light")
    .fillColor("#888888")
    .text("Page 1", 0, pageHeight - 30, { align: "center", width: pageWidth })
    .fillColor("#000000");

  const user = await EntityDetails.findOne({ userId }).populate({
    path: "userId",
    select: "fullName",
    model: "User",
  });

  doc
    .fontSize(12)
    .font("Helvetica-Bold")
    .text(user.entityName || "[Restaurant Name]", leftMargin + 12, doc.y + 50)
    .font("Helveticaneue-Light")
    .text(user.userId.fullName || "[Account Owner Name]")
    .text(`${user.location || "[Street]"} ${user.buildingName || ""}`.trim())
    .text(`${user.zipcode || "ZIP"} ${user.city || "City"}`);

  doc
    .fontSize(20)
    .font("Helveticaneue-Light")
    .text("Order Documentation", leftMargin + 12, doc.y + 30)
    .fontSize(12)
    .text(`${fromDate} - ${toDate}`, leftMargin + 15)
    .text("Report Exported:", leftMargin + 310, doc.y - 19.5)
    .text(
      new Date().toLocaleDateString(),
      pageWidth - leftMargin - rightMargin - 125,
      doc.y - 11
    );

  doc
    .moveTo(leftMargin + 12, doc.y + 20)
    .lineTo(pageWidth - rightMargin - 40, doc.y + 20)
    .lineWidth(1)
    .strokeColor("#000000")
    .stroke();

  doc
    .fontSize(12)
    .font("Helvetica-Bold")
    .text("Counter", leftMargin + 12, doc.y + 40)
    .text("Orders", leftMargin + 150, doc.y - 15)
    .text("Avg orders\nper week", leftMargin + 250, doc.y - 15)
    .text(
      "Total Amount\n[CHF]",
      pageWidth - leftMargin - rightMargin - 130,
      doc.y - 28
    );

  const orders = await Order.find({
    status: payload.status,
    entityId,
    createdAt: {
      $gte: start,
      $lte: end,
    },
  });

  const counterMap = {};
  for (const order of orders) {
    const cid = order.counterId?.toString();
    if (cid) {
      if (!counterMap[cid]) counterMap[cid] = [];
      counterMap[cid].push(order);
    }
  }

  for (const [counterId, orderList] of Object.entries(counterMap)) {
    const counter = await Counter.findOne({ _id: counterId, entityId });
    const totalOrders = orderList.length;
    const totalAmount = orderList.reduce((sum, o) => {
      const amount = o.totalAmount;
      return typeof amount === "number" && !isNaN(amount) ? sum + amount : sum;
    }, 0);

    const weeks = Math.max(
      1,
      (new Date(toDate) - new Date(fromDate)) / (7 * 24 * 60 * 60 * 1000)
    );
    const avgPerWeek = (totalOrders / weeks).toFixed(1);

    doc
      .fontSize(12)
      .font("Helveticaneue-Light")
      .text(
        counter?.counterName || "[Counter name]",
        leftMargin + 12,
        doc.y + 20
      )
      .text(totalOrders.toString(), leftMargin + 160, doc.y - 15)
      .text(avgPerWeek.toString(), leftMargin + 250, doc.y - 12)
      .text(
        `${totalAmount.toFixed(2)}`,
        pageWidth - leftMargin - rightMargin - 130,
        doc.y - 14
      );
  }

  // ── Item-wise analysis ──────────────────────────────────────────────
  const itemMap = {};
  for (const order of orders) {
    for (const orderItem of order.items || []) {
      const itemId = orderItem.itemId?.toString();
      if (!itemId) continue;
      if (!itemMap[itemId]) {
        itemMap[itemId] = { quantity: 0, totalAmount: 0, itemDoc: null };
      }
      itemMap[itemId].quantity += orderItem.quantity || 1;
    }
  }

  // Fetch item details for all unique itemIds in one query
  const itemIds = Object.keys(itemMap);
  if (itemIds.length > 0) {
    const itemDocs = await ItemDetails.find(
      { _id: { $in: itemIds } },
      "itemName price"
    ).lean();

    for (const item of itemDocs) {
      const entry = itemMap[item._id.toString()];
      entry.itemDoc = item;
      entry.totalAmount = (item.price || 0) * entry.quantity;
    }

    // Divider
    doc
      .moveTo(leftMargin + 12, doc.y + 30)
      .lineTo(pageWidth - rightMargin - 40, doc.y + 30)
      .lineWidth(1)
      .strokeColor("#000000")
      .stroke();

    // Table headers
    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .text("Item name", leftMargin + 12, doc.y + 15)
      .text("Item price", leftMargin + 200, doc.y - 15)
      .text("Orders", leftMargin + 320, doc.y - 15)
      .text(
        "Total Amount\n[CHF]",
        pageWidth - leftMargin - rightMargin - 130,
        doc.y - 28
      );

    // Table rows
    for (const [, entry] of Object.entries(itemMap)) {
      if (!entry.itemDoc) continue;
      const { itemName, price } = entry.itemDoc;
      doc
        .fontSize(12)
        .font("Helveticaneue-Light")
        .text(itemName || "[Item]", leftMargin + 12, doc.y + 20)
        .text(`${(price || 0).toFixed(2)}`, leftMargin + 200, doc.y - 15)
        .text(entry.quantity.toString(), leftMargin + 330, doc.y - 12)
        .text(
          entry.totalAmount.toFixed(2),
          pageWidth - leftMargin - rightMargin - 130,
          doc.y - 14
        );
    }
  }

  doc.fillColor("#000000");
  doc.end(); // triggers the 'end' event

  return await finished;
};
