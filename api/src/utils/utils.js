const axios = require("axios");
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

module.exports = { urlNormalizer };
