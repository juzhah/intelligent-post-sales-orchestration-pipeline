require("dotenv").config();
//const { port } = require("./utils/config");
const port = 3030;
/* TODO:  Crear GENERATE PDF endpoint */
/* TODO:  Crear sistema de logging */
/* TODO:  Crear rate limiter */
/* TODO:  Proteger  endpoints sensibles con API Bearer Token*/

const express = require("express");
const cfScrapperRoute = require("./routes/cfscraper");
const pdfGeneratorRoute = require("./routes/pdfGenerator");
const errorHandling = require("./middleware/errorHandling");

const app = express();

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api", cfScrapperRoute);
app.use("/api", pdfGeneratorRoute);

app.use(errorHandling);

app.listen(port, () => console.log(`API running on ${port}`));
