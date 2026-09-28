// Small helpers shared by route files.
class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
const badRequest = (message, details) => new HttpError(400, message, details);
const notFound = (what = "Not found") => new HttpError(404, what);

// Wraps a route handler so thrown HttpErrors become JSON responses.
const handle = (fn) => (req, res, next) => {
  try {
    const out = fn(req, res, next);
    if (out && typeof out.catch === "function") out.catch(next);
  } catch (e) {
    next(e);
  }
};

module.exports = { HttpError, badRequest, notFound, handle };
