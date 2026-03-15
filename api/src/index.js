require("dotenv").config();

/* TODO:  Crear GENERATE PDF endpoint */
/* TODO:  Crear sistema de logging */
/* TODO:  Crear rate limiter */
/* TODO:  Proteger  endpoints sensibles con API Bearer Token*/

const express = require("express");
const cfScrapperService = require("./routes/cfscraper");
const errorHandling = require("./middleware/errorHandling");

const app = express();
const PORT = 3030;

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api", cfScrapperService);

app.use(errorHandling);

app.listen(PORT, () => console.log(`API running on ${PORT}`));
