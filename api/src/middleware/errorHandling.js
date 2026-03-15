const CFError = require("../customErrors/CFError");

function errorHandling(error, req, res, next) {
  if (error.name === "ValidationError") {
    return res.status(400).send({
      type: "ValidationError",
      details: error.details,
    });
  }

  if (error instanceof CFError) {
    return res
      .status(error.statusCode)
      .json({ errorCode: error.errorCorde, message: error.message });
  }

  return res
    .status(500)
    .json({ status: 500, message: "Something went wrong." });
}

module.exports = errorHandling;
