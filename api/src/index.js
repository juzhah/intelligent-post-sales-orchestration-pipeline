const express = require("express");
const scrapperService = require("./routes/scrapper");

const app = express();
const PORT = 3030;

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api", scrapperService);

app.listen(PORT, () => console.log(`API running on ${PORT}`));
