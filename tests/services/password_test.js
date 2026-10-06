import { hashPassword, verifyPassword, needsRehash } from "../../src/services/password.js";
import { config } from "../../src/config/index.js";

async function runTests() {
  console.log("=== Password Service Test Suite ===\n");

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

  // Test 1: hashPassword returns argon2id hash
  console.log("\n1. hashPassword");
  const password = "testpassword123";
  const hash = await hashPassword(password);
  assert(typeof hash === "string" && hash.length > 0, "hashPassword returns string");
  assert(hash.startsWith("$argon2id$"), "hash uses argon2id algorithm");

  // Test 2: verifyPassword returns true for correct password
  console.log("\n2. verifyPassword (correct)");
  const valid = await verifyPassword(hash, password);
  assert(valid === true, "verifyPassword returns true for correct password");

  // Test 3: verifyPassword returns false for wrong password
  console.log("\n3. verifyPassword (incorrect)");
  const invalid = await verifyPassword(hash, "wrongpassword");
  assert(invalid === false, "verifyPassword returns false for wrong password");

  // Test 4: Different passwords produce different hashes
  console.log("\n4. Hash uniqueness");
  const hash2 = await hashPassword(password);
  assert(hash !== hash2, "Different hashes for same password (salting)");

  // Test 5: needsRehash returns false for current config
  console.log("\n5. needsRehash (current config)");
  const rehash = needsRehash(hash);
  assert(rehash === false, "needsRehash returns false for current config");

  // Test 6: needsRehash returns true for different algorithm
  console.log("\n6. needsRehash (different algorithm)");
  const oldHash = "$argon2i$v=19$m=65536,t=3,p=4$salt$hash";
  const rehashOld = needsRehash(oldHash);
  assert(rehashOld === true, "needsRehash returns true for argon2i");

  // Test 7: needsRehash returns true for different params
  console.log("\n7. needsRehash (different params)");
  const differentParams = "$argon2id$v=19$m=32768,t=2,p=1$salt$hash";
  const rehashParams = needsRehash(differentParams);
  assert(rehashParams === true, "needsRehash returns true for different params");

  // Test 8: needsRehash handles invalid hash gracefully
  console.log("\n8. needsRehash (invalid hash)");
  const rehashInvalid = needsRehash("not-a-hash");
  assert(rehashInvalid === true, "needsRehash returns true for invalid hash");

  // Test 9: verifyPassword handles invalid hash gracefully
  console.log("\n9. verifyPassword (invalid hash)");
  const verifyInvalid = await verifyPassword("not-a-hash", password);
  assert(verifyInvalid === false, "verifyPassword returns false for invalid hash");

  // Test 10: Config values used correctly
  console.log("\n10. Config integration");
  const testHash = await hashPassword("configtest");
  const options = testHash.match(/\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)/);
  assert(options !== null, "Hash contains parameters");
  const [, m, t, p] = options;
  assert(parseInt(m) === config.argon2.memory, `Memory cost matches config (${config.argon2.memory})`);
  assert(parseInt(t) === config.argon2.iterations, `Time cost matches config (${config.argon2.iterations})`);
  assert(parseInt(p) === config.argon2.parallelism, `Parallelism matches config (${config.argon2.parallelism})`);

  console.log("\n=== Test Summary ===");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);

  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error("Test suite crashed:", e);
  process.exit(1);
});