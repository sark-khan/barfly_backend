const PDFDocument = require("pdfkit");
// const { getDistinctYears } = require("../Controller/Owner/service");

// module.exports.ownerTrades = async (res) => {
//   const payload = {
//     status: "cancelled",
//   };
//   const doc = new PDFDocument({ size: [595, 842] });
//   const buffers = [];

//   doc.registerFont(
//     "Helveticaneue-Light",
//     "Assets/fonts/HelveticaNeueLight.otf"
//   );
//   doc.registerFont(
//     "Helveticaneue-Medium",
//     "Assets/fonts/HelveticaNeueMedium.otf"
//   );
//   doc.registerFont(
//     "Helveticaneue-Regular",
//     "Assets/fonts/HelveticaNeue Regular.ttf"
//   );
//   // doc.registerFont("Helveticaneue-Bold", "assets/fonts/Helveticaneue-Bold.ttf");
//   // doc.registerFont("Helveticaneue-SemiBold", "assets/fonts/Helveticaneue-SemiBold.ttf");
//   const logoPath = "Assets/logo_export.png";
//   doc.on("data", (chunk) => {
//     buffers.push(chunk);
//   });

//   // doc.on("end", () => {
//   //   const pdfBuffer = Buffer.concat(buffers);
//   //   resolve(pdfBuffer);
//   // });

//   doc.on("error", (error) => {
//     reject(error);
//   });

//   doc.pipe(res);

//   let leftMargin = 25;
//   let rightMargin = 20;
//   const pageWidth = doc.page.width;
//   const topMargin = 30;

//   const logoWidth = 250;
//   const logoHeight = 70;
//   doc.image(logoPath, leftMargin, topMargin, {
//     width: logoWidth,
//     height: logoHeight,
//     align: "left",
//     valign: "center",
//   });

//   doc
//     .fontSize(12)
//     .font("Helvetica-Bold")
//     .text(
//       "countr app",
//       pageWidth - leftMargin - rightMargin - 130,
//       topMargin + 25,
//       {
//         valign: "center",
//         align: "left",
//       }
//     );
//   doc
//     .fontSize(11)
//     .font("Helveticaneue-Light")
//     .text(
//       "www.countr-app.ch\ninfo@countr-app.ch",
//       pageWidth - leftMargin - rightMargin - 130,
//       doc.y,
//       {
//         valign: "center",
//         align: "left",
//       }
//     );

//   let yAxisOfLine = doc.y + 50;

//   doc
//     .fontSize(12)
//     .font("Helvetica-Bold")
//     .text("[Restaurant Name]", leftMargin + 12, yAxisOfLine, {
//       valign: "center",
//       align: "left",
//     });
//   yAxisOfLine = doc.y;

//   doc
//     .fontSize(12)
//     .font("Helveticaneue-Light")
//     .text("[Account Owner Name]", leftMargin + 12, doc.y + 4, {
//       valign: "center",
//       align: "left",
//     });

//   doc
//     .fontSize(12)
//     .font("Helveticaneue-Light")
//     .text("[Street | House Number]", leftMargin + 12, doc.y + 4, {
//       valign: "center",
//       align: "left",
//     });

//   doc
//     .fontSize(12)
//     .font("Helveticaneue-Light")
//     .text("[ZIP Code | City]", leftMargin + 12, doc.y + 4, {
//       valign: "center",
//       align: "left",
//     });

//   let yAxisOfLineAfterDetails = doc.y;

//   doc
//     .fontSize(12)
//     .font("Helveticaneue-Light")
//     .text(
//       "[Bank Accout Number]",
//       pageWidth - leftMargin - rightMargin - 130,
//       yAxisOfLine,
//       {
//         valign: "center",
//         align: "left",
//       }
//     );

//   doc
//     .fontSize(12)
//     .font("Helveticaneue-Light")
//     .text("[BIC]", pageWidth - leftMargin - rightMargin - 130, doc.y + 4, {
//       valign: "center",
//       align: "left",
//     });

//   doc
//     .fontSize(12)
//     .font("Helveticaneue-Light")
//     .text(
//       "[MWST-Number]",
//       pageWidth - leftMargin - rightMargin - 130,
//       doc.y + 4,
//       {
//         valign: "center",
//         align: "left",
//       }
//     );

//   doc
//     .fontSize(20)
//     .font("Helveticaneue-Light")
//     .text(
//       "Order Documentation",
//       leftMargin + 12,
//       yAxisOfLineAfterDetails + 40,
//       {
//         valign: "center",
//         align: "left",
//       }
//     );

//   doc
//     .fontSize(12)
//     .font("Helvetica")
//     .text("[dd.mm.yyyy] - [dd.mm.yyyy]", leftMargin + 12, doc.y + 4, {
//       valign: "center",
//       align: "left",
//     });

//   doc
//     .fontSize(12)
//     .font("Helveticaneue-Light")
//     .text("report exported:", leftMargin + 270, doc.y - 18, {
//       valign: "center",
//       align: "left",
//     });

//   doc
//     .fontSize(12)
//     .font("Helveticaneue-Light")
//     .text(
//       "[dd.mm.yyyy]",
//       pageWidth - leftMargin - rightMargin - 130,
//       doc.y - 14,
//       {
//         valign: "center",
//         align: "left",
//       }
//     );

//   doc
//     .moveTo(leftMargin + 12, doc.y + 20) // Starting point (x, y)
//     .lineTo(pageWidth - rightMargin - 95, doc.y + 20) // Ending point (x, y)
//     .lineWidth(1) // Set line width
//     .strokeColor("#000000") // Set line color (e.g., blue)
//     .stroke();

//   yAxisOfLine = doc.y + 40;

//   doc
//     .fontSize(12)
//     .font("Helvetica-Bold")
//     .text("Counter", leftMargin + 12, yAxisOfLine, {
//       valign: "center",
//       align: "left",
//     });

//   doc
//     .fontSize(12)
//     .font("Helvetica-Bold")
//     .text("Orders", leftMargin + 150, yAxisOfLine, {
//       valign: "center",
//       align: "left",
//     });

//   doc
//     .fontSize(12)
//     .font("Helvetica-Bold")
//     .text("Avg orders\nper week", leftMargin + 250, yAxisOfLine, {
//       valign: "center",
//       align: "left",
//     });

//   yAxisOfLineAfterDetails = doc.y;

//   for (var i = 0; i < 3; i++) {
//     doc
//       .fontSize(12)
//       .font("Helvetica-Bold")
//       .text(
//         "Total Amount\n[CHF]",
//         pageWidth - leftMargin - rightMargin - 130,
//         yAxisOfLine,
//         {
//           valign: "center",
//           align: "left",
//         }
//       );

//     doc
//       .fontSize(12)
//       .font("Helveticaneue-Light")
//       .text("[Counter name 1]", leftMargin + 12, yAxisOfLineAfterDetails + 20, {
//         valign: "center",
//         align: "left",
//       });

//     doc
//       .fontSize(12)
//       .font("Helveticaneue-Light")
//       .text("[Total orders]", leftMargin + 150, yAxisOfLineAfterDetails + 20, {
//         valign: "center",
//         align: "left",
//       });

//     doc
//       .fontSize(12)
//       .font("Helveticaneue-Light")
//       .text(
//         "[Avg ord. p. week]",
//         leftMargin + 250,
//         yAxisOfLineAfterDetails + 20,
//         {
//           valign: "center",
//           align: "left",
//         }
//       );

//     doc
//       .fontSize(12)
//       .font("Helveticaneue-Light")
//       .text(
//         "[Amount]/[Am.p.ord.]",
//         pageWidth - leftMargin - rightMargin - 130,
//         yAxisOfLineAfterDetails + 20,
//         {
//           valign: "center",
//           align: "left",
//         }
//       );
//   }
//   // doc
//   //   .fontSize(24)
//   //   .text("MoneyMatch", leftMargin, topMargin, {
//   //     continued: true,
//   //     height: 32,
//   //     align: "left",
//   //     valign: "center",
//   //   })
//   //   .fillColor(`${payload.status === "cancelled" ? "#ff0000" : "#000000"}`)
//   //   .text("confirmationText", {
//   //     height: 32,
//   //     align: "left",
//   //   });
//   doc.fillColor("#000000");
//   // const logoWidth = 282;
//   // const logoHeight = 35;
//   // doc.image(logoPath, pageWidth - logoWidth - rightMargin, topMargin - 2, {
//   //   width: logoWidth,
//   //   height: logoHeight,
//   //   align: "right",
//   //   valign: "center",
//   // });

//   // let yAxisO÷fLine = 124;
//   doc.end();
// };

// const PDFDocument = require("pdfkit");
const { ORDER_STATUS } = require("../Utils/globalConstants");
const User = require("../Models/User");
const Order = require("../Models/Order");
const Counter = require("../Models/Counter");
const EntityDetails = require("../Models/EntityDetails");
// const path = require("path");
// const Order = require("../models/Order");
// const Counter = require("../models/Counter");
// const User = require("../models/User");

module.exports.ownerTrades = async (req, res) => {
  try {
    const {
      userId,
      entityId,
      query: { fromDate, toDate },
    } = req;
    const payload = { status: ORDER_STATUS.COMPLETED };
    const doc = new PDFDocument({ size: [595, 842] });
    const buffers = [];

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

    const logoPath = "Assets/logo_export.png";
    doc.on("data", (chunk) => buffers.push(chunk));
    doc.pipe(res);

    const pageWidth = doc.page.width;
    const leftMargin = 25;
    const rightMargin = 20;
    const topMargin = 30;

    // ─── Add Header ─────────────────────────────
    doc.image(logoPath, leftMargin, topMargin, { width: 250, height: 70 });

    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .text(
        "countr app",
        pageWidth - leftMargin - rightMargin - 130,
        topMargin + 25
      );
    doc
      .fontSize(11)
      .font("Helveticaneue-Light")
      .text(
        "www.countr-app.ch\ninfo@countr-app.ch",
        pageWidth - leftMargin - rightMargin - 130
      );

    const user = await EntityDetails.findOne({
      userId,
      entityId,
    }).populate({
      path: "userId",
      select: "fullName",
      model: "User",
    });
    console.log({ user });
    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .text(
        user.entityName || "[Restaurant Name]",
        leftMargin + 12,
        doc.y + 50
      );
    doc
      .fontSize(12)
      .font("Helveticaneue-Light")
      .text(user.userId.fullName || "[Account Owner Name]");
    doc.text(`${user.zipcode || "ZIP"} ${user.city || "City"}`);

    doc
      .fontSize(20)
      .font("Helveticaneue-Light")
      .text("Order Documentation", leftMargin + 12, doc.y + 30);
    doc.fontSize(12).text(`${fromDate} - ${toDate}`, leftMargin + 15);
    doc.text("report exported:", leftMargin + 310, doc.y - 19.5);
    doc.text(
      new Date().toLocaleDateString(),
      pageWidth - leftMargin - rightMargin - 130,
      doc.y - 10.5
    );

    doc
      .moveTo(leftMargin + 12, doc.y + 20)
      .lineTo(pageWidth - rightMargin - 95, doc.y + 20)
      .lineWidth(1)
      .strokeColor("#000000")
      .stroke();

    // ─── Table Headers ──────────────────────────
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

    // ─── Fetch Orders ─────────────────
    const orders = await Order.find({
      status: payload.status,
      createdAt: { $gte: new Date(fromDate), $lte: new Date(toDate) },
    });

    console.log({ orders });

    // Group Orders by Counter
    const counterMap = {};
    for (const order of orders) {
      const cid = order.counterId.toString();
      if (!counterMap[cid]) counterMap[cid] = [];
      counterMap[cid].push(order);
    }

    for (const [counterId, orderList] of Object.entries(counterMap)) {
      const counter = await Counter.findById(counterId);
      const totalOrders = orderList.length;

      // Sum the amounts, filtering out invalid values (undefined, null, NaN)
      const totalAmount = orderList.reduce((sum, o) => {
        const amount = o.totalAmount;
        if (typeof amount === "number" && !isNaN(amount)) {
          return sum + amount;
        } else {
          console.log(`Invalid totalAmount for order ${o._id}: ${amount}`);
          return sum; // Ignore invalid amounts and proceed with summing valid ones
        }
      }, 0);

      const weeks = Math.max(
        1,
        (new Date(toDate) - new Date(fromDate)) / (7 * 24 * 60 * 60 * 1000)
      );
      const avgPerWeek = (totalOrders / weeks).toFixed(1);
      const amountPerOrder =
        totalOrders > 0 ? (totalAmount / totalOrders).toFixed(2) : "0.00";

      console.log(`Total Amount for ${counter.counterName}: ${totalAmount}`); // Debugging log to check totalAmount

      doc
        .fontSize(12)
        .font("Helveticaneue-Light")
        .text(
          counter.counterName || "[Counter name]",
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

    doc.fillColor("#000000");
    doc.end();
  } catch (error) {
    console.error("Error generating PDF:", error);
    res.status(500).send("Error generating PDF");
  }
};
