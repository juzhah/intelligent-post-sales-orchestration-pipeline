const { Router } = require("express");
const scrapeService = require("../services/scrapperService");

const router = Router();

router.post("/scrape", async (req, res) => {
  const domain = req.body.domain?.trim().toLowerCase();

  if (!domain) {
    return res.status(400).json({ error: "domain is required" });
  }

  try {
    const result = await scrapeService(domain);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Scrape Failed", detail: err.message });
  }
});

module.exports = router;
