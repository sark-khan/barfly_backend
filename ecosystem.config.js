module.exports = {
  apps: [
    {
      script: "npm start",
      watch: ".",
      name: "BARFLY",
      log_date_format: "YYYY-MM-DD HH:mm:ss.SSS",
      ignore_watch: ["uploads"],
      env: {
        PORT: 2000,
        DB_URI:
          "mongodb+srv://kartikkatwal:vSuTqpUtFkxAaFTu@cluster0.yqntl8m.mongodb.net/?retryWrites=true&w=majority",
        MAIL_USER:"tsfilms.dev@gmail.com",
        MAIL_PASS:"uolecadvitnyyftf",
        // MAIL_FROM: ""
        SMTP_HOST:"smtp.gmail.com",
        // HOST_URL:"http://43.204.181.73"
      },
    },
  ],
};
