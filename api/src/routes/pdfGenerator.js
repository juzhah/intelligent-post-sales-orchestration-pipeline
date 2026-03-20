const { Router } = require("express");
const generatePDF = require("../services/pdfGeneratorService");

const router = Router();

router.post("/gen-pdf", async (req, res, next) => {
  try {
    const body = req.body.output;

    const pdfBuffer = await generatePDF(body);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="onboarding-briefing.pdf"',
      "Content-Length": pdfBuffer.length,
    });

    return res.status(200).end(pdfBuffer);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
