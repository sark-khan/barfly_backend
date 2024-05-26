module.exports = {
    apps: [
      {
        script: "npm start",
        watch: ".",
        name: "BARFLY",
        log_date_format: "YYYY-MM-DD HH:mm:ss.SSS",
        ignore_watch: ['uploads'],
        env: {
          PORT: 2000,
          DB_URI:
            "mongodb+srv://kartikkatwal:vSuTqpUtFkxAaFTu@cluster0.yqntl8m.mongodb.net/",
        //   mail_user:"tsfilms.dev@gmail.com",
        //   MAIL_PASS:"uolecadvitnyyftf",
        //   SMTP_HOST:"smtp.gmail.com",
        //   HOST_URL:"http://43.204.181.73"
        },
      },
    ],
  };