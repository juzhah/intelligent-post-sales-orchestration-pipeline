const axios = require("axios");
const cheerio = require("cheerio");
/* 
  Normalizes domain url as a URL object
  ?? Ensures https protocol for safe connection ???
  ?? what if no protocol is provided ???
  ?? what if not a valid domain??? ex no TLD provided?
*/
function urlNormalizer(domain) {
  const withProtocol = /^https?:\/\//i.test(domain)
    ? domain
    : `https://${domain}`;
  return new URL(withProtocol).origin;
}

const TEXT_CAP = 99999999999999999;
async function fetchPage(domain) {
  /* HTTP REQUEST TO AN URL */
  const response = await axios.get(domain, { timeout: 8000 });
  const $ = cheerio.load(response.data);

  /* Removes Noise */
  $("script, style, noscript, nav, footer, header, form, button, a").remove();

  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, TEXT_CAP);
  return { domain, text };
}

module.exports = { urlNormalizer, fetchPage };
