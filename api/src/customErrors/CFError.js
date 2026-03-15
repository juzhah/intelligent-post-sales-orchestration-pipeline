class CFError extends Error {
  constructor(errorCorde, message, statusCode) {
    super(message);
    this.errorCorde = errorCorde;
    this.statusCode = statusCode;
  }
}

module.exports = CFError;
