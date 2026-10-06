import { createPool, query, execute, close } from "../src/db.js";
import { config } from "../src/config/index.js";
import { AppError, ValidationError, AuthenticationError, AuthorizationError, NotFoundError, errorHandler, notFoundHandler, asyncHandler } from "../src/middleware/errorHandler.js";

async function runTests() {
  console.log("=== Middleware Test Suite ===\n");

  createPool(config.database);

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ ${message}`);
      passed++;
    } else {
      console.log(`  ✗ ${message}`);
      failed++;
    }
  }

  function assertThrows(fn, expectedCode, message) {
    try {
      fn();
      assert(false, `${message} - should have thrown`);
    } catch (e) {
      if (e instanceof AppError && e.code === expectedCode) {
        assert(true, `${message} - throws ${expectedCode}`);
      } else {
        assert(false, `${message} - wrong error: ${e.code} / ${e.message}`);
      }
    }
  }

  // Test 1: Error classes
  console.log("\n1. Error Classes");
  assertThrows(() => { throw new AppError("test", 500, "TEST_CODE"); }, "TEST_CODE", "AppError");
  assertThrows(() => { throw new ValidationError("bad input", ["field"]); }, "VALIDATION_ERROR", "ValidationError");
  assertThrows(() => { throw new AuthenticationError(); }, "AUTHENTICATION_ERROR", "AuthenticationError");
  assertThrows(() => { throw new AuthorizationError(); }, "AUTHORIZATION_ERROR", "AuthorizationError");
  assertThrows(() => { throw new NotFoundError("User"); }, "NOT_FOUND", "NotFoundError");

  // Test 2: Error properties
  console.log("\n2. Error Properties");
  const authErr = new AuthenticationError("custom msg");
  assert(authErr.statusCode === 401, "AuthenticationError statusCode 401");
  assert(authErr.code === "AUTHENTICATION_ERROR", "AuthenticationError code");
  assert(authErr.message === "custom msg", "AuthenticationError message");
  assert(authErr.isOperational === true, "AuthenticationError isOperational");

  const valErr = new ValidationError("bad", [{ field: "email" }]);
  assert(valErr.details.length === 1, "ValidationError details");

  // Test 3: asyncHandler
  console.log("\n3. asyncHandler");
  try {
    let caught = null;
    const handler = asyncHandler(async (req, res, next) => {
      try {
        throw new Error("async error");
      } catch (e) {
        next(e);
      }
    });
    await handler({}, {}, (err) => { caught = err; });
    assert(caught && caught.message === "async error", "asyncHandler passes error to next");
  } catch (e) {
    assert(false, `asyncHandler test failed: ${e.message}`);
  }

  // Test 4: notFoundHandler
  console.log("\n4. notFoundHandler");
  const mockRes = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  notFoundHandler({ method: "GET", path: "/test" }, mockRes);
  assert(mockRes.statusCode === 404, "notFoundHandler status 404");
  assert(mockRes.body.error.code === "NOT_FOUND", "notFoundHandler error code");

  // Test 5: errorHandler with AppError
  console.log("\n5. errorHandler");
  const mockRes2 = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  const authErr2 = new AuthenticationError("login required");
  errorHandler(authErr2, {}, mockRes2, () => {});
  assert(mockRes2.statusCode === 401, "errorHandler AppError status");
  assert(mockRes2.body.error.code === "AUTHENTICATION_ERROR", "errorHandler AppError code");

  // Test 6: errorHandler with generic error (development)
  console.log("\n6. errorHandler (generic error)");
  const mockRes3 = { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; } };
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  errorHandler(new Error("crash"), {}, mockRes3, () => {});
  assert(mockRes3.statusCode === 500, "errorHandler generic error status");
  assert(mockRes3.body.error.code === "INTERNAL_ERROR", "errorHandler generic error code");
  assert(mockRes3.body.error.message === "crash", "errorHandler generic error message");
  process.env.NODE_ENV = originalEnv;

  // Test 7: errorHandler with generic error (production)
  console.log("\n7. errorHandler (production)");
  process.env.NODE_ENV = "production";
  const mockRes4 = { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; } };
  errorHandler(new Error("crash"), {}, mockRes4, () => {});
  assert(mockRes4.statusCode === 500, "errorHandler production status");
  assert(mockRes4.body.error.code === "INTERNAL_ERROR", "errorHandler production code");
  assert(!mockRes4.body.error.message.includes("crash"), "errorHandler production hides details");
  process.env.NODE_ENV = originalEnv;

  // Cleanup
  await close();

  console.log("\n=== Test Summary ===");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);

  if (failed > 0) process.exit(1);
}

runTests().catch(async (e) => {
  console.error("Test suite crashed:", e);
  await close();
  process.exit(1);
});