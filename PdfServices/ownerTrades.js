
const PDFDocument = require("pdfkit");
const { getDistinctYears } = require("../Controller/Owner/service");


module.exports.ownerTrades = (res) => {
    const payload = {
        status: "cancelled"
    }
    const doc = new PDFDocument({ size:[595, 842]  });
    const buffers = [];

    doc.registerFont("Helveticaneue-Light", "assets/fonts/HelveticaneueLight.otf");
    doc.registerFont("Helveticaneue-Medium", "assets/fonts/HelveticaneueMedium.otf");
    doc.registerFont("Helveticaneue-Regular", "assets/fonts/Helveticaneue Regular.ttf");
    // doc.registerFont("Helveticaneue-Bold", "assets/fonts/Helveticaneue-Bold.ttf");
    // doc.registerFont("Helveticaneue-SemiBold", "assets/fonts/Helveticaneue-SemiBold.ttf");
    const logoPath = "Assets/logo_export.png"
    doc.on("data", (chunk) => {
        buffers.push(chunk);
    });

    // doc.on("end", () => {
    //   const pdfBuffer = Buffer.concat(buffers);
    //   resolve(pdfBuffer);
    // });

    doc.on("error", (error) => {
        reject(error);
    });

    doc.pipe(res);

    let leftMargin = 25;
    let rightMargin = 20;
    const pageWidth = doc.page.width;
    const topMargin = 30;

    const logoWidth = 250;
    const logoHeight = 70;
    doc.image(logoPath, leftMargin, topMargin, {
        width: logoWidth,
        height: logoHeight,
        align: "left",
        valign: "center",
    });

    doc.fontSize(12).font("Helvetica-Bold").text("countr app", pageWidth - leftMargin - rightMargin - 130, topMargin + 25, {
        valign: "center",
        align: "left"
    });
    doc.fontSize(11).font("Helveticaneue-Light").text("www.countr-app.ch\ninfo@countr-app.ch", pageWidth - leftMargin - rightMargin - 130, doc.y, {
        valign: "center",
        align: "left"
    });

    let yAxisOfLine = doc.y + 50;

    doc.fontSize(12).font("Helvetica-Bold").text("[Restaurant Name]", leftMargin + 12, yAxisOfLine, {
        valign: "center",
        align: "left"
    });
    yAxisOfLine = doc.y;


    doc.fontSize(12).font("Helveticaneue-Light").text("[Account Owner Name]", leftMargin + 12, doc.y + 4, {
        valign: "center",
        align: "left"
    });

    doc.fontSize(12).font("Helveticaneue-Light").text("[Street | House Number]", leftMargin + 12, doc.y + 4, {
        valign: "center",
        align: "left"
    });

    doc.fontSize(12).font("Helveticaneue-Light").text("[ZIP Code | City]", leftMargin + 12, doc.y + 4, {
        valign: "center",
        align: "left"
    });

    let yAxisOfLineAfterDetails = doc.y;

    doc.fontSize(12).font("Helveticaneue-Light").text("[Bank Accout Number]", pageWidth - leftMargin - rightMargin - 130, yAxisOfLine, {
        valign: "center",
        align: "left"
    });

    doc.fontSize(12).font("Helveticaneue-Light").text("[BIC]", pageWidth - leftMargin - rightMargin - 130, doc.y + 4, {
        valign: "center",
        align: "left"
    });

    doc.fontSize(12).font("Helveticaneue-Light").text("[MWST-Number]", pageWidth - leftMargin - rightMargin - 130, doc.y + 4, {
        valign: "center",
        align: "left"
    });

    doc.fontSize(20).font("Helveticaneue-Light").text("Order Documentation", leftMargin + 12, yAxisOfLineAfterDetails + 40, {
        valign: "center",
        align: "left"
    });

    doc.fontSize(12).font("Helvetica").text("[dd.mm.yyyy] - [dd.mm.yyyy]", leftMargin + 12, doc.y + 4, {
        valign: "center",
        align: "left"
    });

    doc.fontSize(12).font("Helveticaneue-Light").text("report exported:", leftMargin + 270, doc.y - 18, {
        valign: "center",
        align: "left"
    });

    doc.fontSize(12).font("Helveticaneue-Light").text("[dd.mm.yyyy]", pageWidth - leftMargin - rightMargin - 130, doc.y -14, {
        valign: "center",
        align: "left"
    });

    doc
        .moveTo(leftMargin + 12, doc.y + 20)  // Starting point (x, y)
        .lineTo(pageWidth - rightMargin - 95, doc.y + 20)  // Ending point (x, y)
        .lineWidth(1)      // Set line width
        .strokeColor('#000000') // Set line color (e.g., blue)
        .stroke();

    yAxisOfLine = doc.y + 40;

    doc.fontSize(12).font("Helvetica-Bold").text("Counter", leftMargin + 12, yAxisOfLine, {
        valign: "center",
        align: "left"
    });

    doc.fontSize(12).font("Helvetica-Bold").text("Orders", leftMargin + 150, yAxisOfLine, {
        valign: "center",
        align: "left"
    });

    doc.fontSize(12).font("Helvetica-Bold").text("Avg orders\nper week", leftMargin + 250, yAxisOfLine, {
        valign: "center",
        align: "left"
    });

    yAxisOfLineAfterDetails=doc.y;

    for(var i=0;i<3;i++){


    doc.fontSize(12).font("Helvetica-Bold").text("Total Amount\n[CHF]", pageWidth - leftMargin - rightMargin - 130, yAxisOfLine, {
        valign: "center",
        align: "left"
    });

    doc.fontSize(12).font("Helveticaneue-Light").text("[Counter name 1]", leftMargin + 12, yAxisOfLineAfterDetails+20, {
        valign: "center",
        align: "left"
    });


    doc.fontSize(12).font("Helveticaneue-Light").text("[Total orders]", leftMargin+ 150, yAxisOfLineAfterDetails+20, {
        valign: "center",
        align: "left"
    });


    doc.fontSize(12).font("Helveticaneue-Light").text("[Avg ord. p. week]", leftMargin+ 250, yAxisOfLineAfterDetails+20, {
        valign: "center",
        align: "left"
    });


    doc.fontSize(12).font("Helveticaneue-Light").text("[Amount]/[Am.p.ord.]", pageWidth - leftMargin - rightMargin - 130, yAxisOfLineAfterDetails+20, {
        valign: "center",
        align: "left"
    });
}
    // doc
    //   .fontSize(24)
    //   .text("MoneyMatch", leftMargin, topMargin, {
    //     continued: true,
    //     height: 32,
    //     align: "left",
    //     valign: "center",
    //   })
    //   .fillColor(`${payload.status === "cancelled" ? "#ff0000" : "#000000"}`)
    //   .text("confirmationText", {
    //     height: 32,
    //     align: "left",
    //   });
    doc.fillColor("#000000");
    // const logoWidth = 282;
    // const logoHeight = 35;
    // doc.image(logoPath, pageWidth - logoWidth - rightMargin, topMargin - 2, {
    //   width: logoWidth,
    //   height: logoHeight,
    //   align: "right",
    //   valign: "center",
    // });

    // let yAxisO÷fLine = 124;
    doc.end();

}