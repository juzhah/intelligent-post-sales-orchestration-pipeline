# API Code Steps — Express Layer Reference

Step-by-step code for every custom file in the Express API. Use this as a living cheat-sheet as you build each piece.

---

## Step 1 — Entry Point

**File:** `api/src/index.js`

**What's missing:** rateLimiter middleware, pdf router.

```js
const express = require("express");
const rateLimiter = require("./middleware/rateLimiter");
const scrapperRouter = require("./routes/scrapper");
const pdfRouter = require("./routes/pdf");

const app = express();
const PORT = 3030;

app.use(express.json());
app.use(rateLimiter);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api", scrapperRouter);
app.use("/api", pdfRouter);

app.listen(PORT, () => console.log(`API running on ${PORT}`));
```

---

## Step 2 — Rate Limiter

**File:** `api/src/middleware/rateLimiter.js` *(missing — create it)*

**Package needed:** `express-rate-limit`

```js
const rateLimit = require("express-rate-limit");

const rateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,             // 30 requests per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

module.exports = rateLimiter;
```

---

## Step 3 — Utilities

**File:** `api/src/utils/utils.js`

**What's broken:**
- `urlNormalizer` crashes on bare domains like `example.com` (no protocol) — needs a fallback
- `fetchPage` swallows errors and returns nothing — needs to return parsed text

```js
const axios = require("axios");
const cheerio = require("cheerio");

const TEXT_CAP = 3000;

function urlNormalizer(domain) {
  const withProtocol = /^https?:\/\//i.test(domain)
    ? domain
    : `https://${domain}`;
  return new URL(withProtocol).origin;
}

async function fetchPage(url) {
  const response = await axios.get(url, { timeout: 8000 });
  const $ = cheerio.load(response.data);

  // Remove noise
  $("script, style, noscript, nav, footer, header").remove();

  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, TEXT_CAP);
  return { url, text };
}

module.exports = { urlNormalizer, fetchPage };
```

> **Note:** `fetchPage` now throws on HTTP errors (axios default). The service layer handles failures via `Promise.allSettled`.

---

## Step 4 — Scraper Service

**File:** `api/src/services/scrapperService.js`

**What's missing:** structured output — currently returns the raw `Promise.allSettled` array with no parsing.

```js
const { urlNormalizer, fetchPage } = require("../utils/utils");

const PAGES = ["/", "/about", "/services", "/solutions", "/team"];

async function scraper(domain) {
  const baseUrl = urlNormalizer(domain);

  const results = await Promise.allSettled(
    PAGES.map((page) => fetchPage(baseUrl + page)),
  );

  const fulfilled = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);

  const combinedText = fulfilled.map((p) => p.text).join(" ");

  return {
    domain: baseUrl,
    pagesScraped: fulfilled.map((p) => p.url),
    keyServices: extractKeyServices(combinedText),
    techStack: extractTechStack(combinedText),
    summary: combinedText.slice(0, 500),
    scrapedAt: new Date().toISOString(),
  };
}

// --- simple keyword extractors (replace with LLM call later) ---

function extractKeyServices(text) {
  const keywords = ["automation", "crm", "analytics", "integration", "api", "saas", "consulting"];
  return keywords.filter((kw) => text.toLowerCase().includes(kw));
}

function extractTechStack(text) {
  const stack = ["react", "next.js", "node", "salesforce", "hubspot", "stripe", "aws", "gcp"];
  return stack.filter((kw) => text.toLowerCase().includes(kw));
}

module.exports = scraper;
```

---

## Step 5 — PDF Generator Service

**File:** `api/src/services/pdfGenerator.js` *(missing — create it)*

**Package needed:** `pdfkit`

Accepts the structured scrape object from Step 4 and returns a `Buffer`.

```js
const PDFDocument = require("pdfkit");

function generatePdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Header
    doc.fontSize(20).text("RevAuto — Company Research Report", { align: "center" });
    doc.moveDown();

    // Domain
    doc.fontSize(14).text(`Domain: ${data.domain}`);
    doc.fontSize(10).text(`Scraped at: ${data.scrapedAt}`);
    doc.moveDown();

    // Pages scraped
    doc.fontSize(12).text("Pages Scraped:");
    data.pagesScraped.forEach((url) => doc.fontSize(10).text(`  • ${url}`));
    doc.moveDown();

    // Key services
    doc.fontSize(12).text("Key Services Detected:");
    const services = data.keyServices.length ? data.keyServices.join(", ") : "None detected";
    doc.fontSize(10).text(services);
    doc.moveDown();

    // Tech stack
    doc.fontSize(12).text("Tech Stack Detected:");
    const tech = data.techStack.length ? data.techStack.join(", ") : "None detected";
    doc.fontSize(10).text(tech);
    doc.moveDown();

    // Summary
    doc.fontSize(12).text("Summary:");
    doc.fontSize(10).text(data.summary || "No summary available.");

    doc.end();
  });
}

module.exports = generatePdf;
```

---

## Step 6 — Scrape Route

**File:** `api/src/routes/scrapper.js`

Current code is correct. Minor cleanup only (rename import to match convention).

```js
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
    res.status(500).json({ error: "Scrape failed", detail: err.message });
  }
});

module.exports = router;
```

---

## Step 7 — PDF Route

**File:** `api/src/routes/pdf.js` *(missing — create it)*

Accepts the same structured body that the scrape endpoint returns, generates a PDF, and streams it back.

```js
const { Router } = require("express");
const generatePdf = require("../services/pdfGenerator");

const router = Router();

router.post("/pdf", async (req, res) => {
  const data = req.body;

  if (!data?.domain) {
    return res.status(400).json({ error: "Request body must include a valid scrape result (domain required)" });
  }

  try {
    const buffer = await generatePdf(data);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="revauto-${data.domain.replace(/https?:\/\//, "")}.pdf"`,
      "Content-Length": buffer.length,
    });

    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: "PDF generation failed", detail: err.message });
  }
});

module.exports = router;
```

---

## Step 8 — Dockerfile

**File:** `api/Dockerfile` *(empty — fill it in)*

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "src/index.js"]
```

> **Note:** The `PORT` in `index.js` is currently `3030`. Either update `index.js` to read from `process.env.PORT` or change `EXPOSE` to match.

---

## Dependency Checklist

| Package | Used in |
|---|---|
| `express` | index.js |
| `express-rate-limit` | middleware/rateLimiter.js |
| `axios` | utils/utils.js |
| `cheerio` | utils/utils.js |
| `pdfkit` | services/pdfGenerator.js |

Install anything missing:

```bash
pnpm add express-rate-limit axios cheerio pdfkit
```
