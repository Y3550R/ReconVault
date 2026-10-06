export class AppError extends Error {
  constructor(message, statusCode = 500, code = "INTERNAL_ERROR") {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message, details = []) {
    super(message, 400, "VALIDATION_ERROR");
    this.details = details;
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401, "AUTHENTICATION_ERROR");
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "Insufficient permissions") {
    super(message, 403, "AUTHORIZATION_ERROR");
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource") {
    super(`${resource} not found`, 404, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message) {
    super(message, 409, "CONFLICT");
  }
}

export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details ?? null,
      },
    });
  }

  console.error("Unhandled error:", err);

  if (process.env.NODE_ENV === "production") {
    return res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
    });
  }

  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: err.message,
      stack: err.stack,
    },
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `Route ${req.method} ${req.path} not found` } });
}

export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}