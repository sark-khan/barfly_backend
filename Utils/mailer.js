const nodemailer = require("nodemailer");
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 465,
  secure: true,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});
module.exports.createMail = async (mail_data) => {
  try {
    const mailOptions = {
      from: process.env.MAIL_USER,
      to: mail_data.to,
      subject: mail_data.subject,
      text: mail_data.text,
      // html: mail_data.html, // Uncomment if HTML body is needed
    };

    if (mail_data.cc) {
      mailOptions.cc = mail_data.cc;
    }

    // Add BCC if needed
    if (mail_data.bcc) {
      mailOptions.bcc = mail_data.bcc;
    }

    await transporter.verify();
    await transporter.sendMail(mailOptions);
    console.info(`Email sent to: ${mail_data.to}`);
    if (mail_data.cc) {
      console.info(`Sending mail to CC: ${mail_data.cc}`);
    }
    transporter.close();
    return true;
  } catch (error) {
    console.error("ERROR!!! While sending email", error);
    return false;
  }
};
