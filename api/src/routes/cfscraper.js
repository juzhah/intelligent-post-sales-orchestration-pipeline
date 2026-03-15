const { Router } = require("express");
const cfScrapeService = require("../services/cfScraperService");

const router = Router();

router.post("/scraper", async (req, res, next) => {
  try {
    const domain = req.body.url?.trim().toLowerCase();

    if (!domain) {
      const validationError = new Error();
      validationError.name = "ValidationError";
      validationError.details = "`url` is required";

      throw validationError;
    }
    const result = await cfScrapeService(domain);

    return res.status(200).json({ status: 200, data: result.records[0]?.json });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
