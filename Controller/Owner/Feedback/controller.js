const express = require("express");
const {
  createSurveyQuestion,
  archiveSurveyQuestion,
  getSurveyQuestions,
} = require("./service");
const { STATUS_CODES } = require("../../../Utils/globalConstants");
const router = express.Router();
const verifyToken = require("../../../Utils/verifyToken");

router.use(verifyToken);

router.post("/create-survey-question", async (req, res) => {
  try {
    const response = await createSurveyQuestion(req);
    return res.status(STATUS_CODES.OK).json({
      message: "Your feedback is saved",
      data: response,
    });
  } catch (error) {
    console.error("Error while creating survey", error);
    return res.status(error.status || 400).json({ message: error.message });
  }
});

router.put("/archive-survey-question/:id", async (req, res) => {
  try {
    const response = await archiveSurveyQuestion(req.params.id);
    return res.status(STATUS_CODES.OK).json({
      message: "Survey question archived",
    });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});


router.get("/get-survey-questions", async (req, res) => {
  const { archive = false } = req.query;
  try {
    const response = await getSurveyQuestions(archive === "true");
    return res.status(STATUS_CODES.OK).json({
      message: "Feedback succesfully fetched",
      data: response,
    });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
});

module.exports = router;
