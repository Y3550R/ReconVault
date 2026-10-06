import {
  validateIPv4,
  validateIPv6,
  validateIP,
  validateIPType,
  validatePort,
  validateCIDR,
  validateCIDRArray,
  validateEnum,
  sanitizeString,
  parseSort,
  parseFilter,
  ENGAGEMENT_STATUSES,
  SCAN_STATUSES,
  SCAN_TYPES,
  TARGET_STATUSES,
  SERVICE_STATES,
  FINDING_SEVERITIES,
  FINDING_STATUSES,
  USER_STATUSES,
  CONTRIBUTOR_TYPES,
  PROTOCOLS,
} from "../../src/utils/validation.js";

async function runTests() {
  console.log("=== Validation Utils Test Suite ===\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  \u2713 ${message}`);
      passed++;
    } else {
      console.log(`  \u2717 ${message}`);
      failed++;
    }
  }

  // IPv4 Tests
  console.log("\n1. IPv4 Validation");
  assert(validateIPv4("192.168.1.1"), "Valid IPv4");
  assert(validateIPv4("10.0.0.1"), "Valid IPv4 private");
  assert(validateIPv4("255.255.255.255"), "Valid IPv4 broadcast");
  assert(validateIPv4("0.0.0.0"), "Valid IPv4 zero");
  assert(!validateIPv4("256.1.1.1"), "Invalid IPv4 > 255");
  assert(!validateIPv4("192.168.1"), "Invalid IPv4 missing octet");
  assert(!validateIPv4("192.168.1.1.1"), "Invalid IPv4 extra octet");
  assert(!validateIPv4("192.168.01.1"), "Invalid IPv4 leading zero");
  assert(!validateIPv4("192.168.1.1 "), "Invalid IPv4 trailing space");
  assert(!validateIPv4(""), "Invalid empty string");

  // IPv6 Tests
  console.log("\n2. IPv6 Validation");
  assert(validateIPv6("2001:0db8:85a3:0000:0000:8a2e:0370:7334"), "Valid IPv6");
  assert(validateIPv6("::1"), "Loopback ::1");
  assert(validateIPv6("::"), "Unspecified ::");
  assert(!validateIPv6("2001:db8::1"), "Invalid compressed IPv6 (not full)");
  assert(!validateIPv6("192.168.1.1"), "IPv4 not IPv6");

  // IP Type Detection
  console.log("\n2b. IP Type Detection");
  assert(validateIPType("192.168.1.1") === "IPV4", "IPV4 type");
  assert(validateIPType("2001:0db8:85a3:0000:0000:8a2e:0370:7334") === "IPV6", "IPV6 type");
  assert(validateIPType("::1") === "IPV6", "Loopback is IPV6");
  assert(validateIPType("invalid") === null, "Invalid returns null");

  // IP (both)
  console.log("\n3. IP (both)");
  assert(validateIP("192.168.1.1"), "IPv4 passes");
  assert(validateIP("2001:0db8:85a3:0000:0000:8a2e:0370:7334"), "IPv6 passes");
  assert(!validateIP("invalid"), "Invalid fails");

  // Port Validation
  console.log("\n4. Port Validation");
  assert(validatePort(80), "Valid port 80");
  assert(validatePort(443), "Valid port 443");
  assert(validatePort(1), "Valid port 1");
  assert(validatePort(65535), "Valid port 65535");
  assert(!validatePort(0), "Invalid port 0");
  assert(!validatePort(65536), "Invalid port 65536");
  assert(!validatePort(-1), "Invalid negative port");
  assert(!validatePort("80"), "String port (should be number)");
  assert(!validatePort(80.5), "Float port");

  // CIDR Validation
  console.log("\n5. CIDR Validation");
  assert(validateCIDR("192.168.1.0/24"), "Valid CIDR /24");
  assert(validateCIDR("10.0.0.0/8"), "Valid CIDR /8");
  assert(validateCIDR("172.16.0.0/12"), "Valid CIDR /12");
  assert(validateCIDR("0.0.0.0/0"), "Valid CIDR /0");
  assert(validateCIDR("192.168.1.1/32"), "Valid CIDR /32");
  assert(!validateCIDR("192.168.1.0/33"), "Invalid CIDR /33");
  assert(!validateCIDR("256.1.1.0/24"), "Invalid CIDR IP");
  assert(!validateCIDR("192.168.1.0"), "Missing prefix");
  assert(!validateCIDR("192.168.1.0/"), "Empty prefix");

  // CIDR Array
  console.log("\n6. CIDR Array");
  assert(validateCIDRArray(["192.168.1.0/24", "10.0.0.0/8"]), "Valid array");
  assert(!validateCIDRArray(["192.168.1.0/24", "invalid"]), "Invalid in array");
  assert(!validateCIDRArray([]), "Empty array");
  assert(!validateCIDRArray("not-array"), "Not array");

  // Enum Validation
  console.log("\n7. Enum Validation");
  assert(validateEnum("ACTIVE", USER_STATUSES), "Valid user status");
  assert(validateEnum("INACTIVE", USER_STATUSES), "Valid user status 2");
  assert(!validateEnum("PENDING", USER_STATUSES), "Invalid user status");
  assert(validateEnum("HIGH", FINDING_SEVERITIES), "Valid severity");
  assert(validateEnum("TCP", PROTOCOLS), "Valid protocol");
  assert(!validateEnum("HTTP", PROTOCOLS), "Invalid protocol");

  // String Sanitization
  console.log("\n8. String Sanitization");
  assert(sanitizeString("  hello  ") === "hello", "Trims whitespace");
  assert(sanitizeString("a".repeat(2000), 100) === "a".repeat(100), "Truncates to maxLength");
  assert(sanitizeString("", 10) === "", "Empty string");
  assert(sanitizeString(123, 10) === "", "Non-string returns empty");
  assert(sanitizeString(null, 10) === "", "Null returns empty");

  // Sort Parsing
  console.log("\n9. Sort Parsing");
  assert(parseSort("created_at:desc", ["created_at", "name"])?.field === "created_at", "Sort field");
  assert(parseSort("created_at:desc", ["created_at", "name"])?.direction === "DESC", "Sort direction desc");
  assert(parseSort("name:asc", ["created_at", "name"])?.direction === "ASC", "Sort direction asc");
  assert(parseSort("invalid:desc", ["created_at", "name"]) === null, "Invalid field rejected");
  assert(parseSort("created_at", ["created_at", "name"])?.direction === "ASC", "Default direction asc");
  assert(parseSort(null, ["created_at"]) === null, "Null input");
  assert(parseSort("", ["created_at"]) === null, "Empty input");

  // Filter Parsing
  console.log("\n10. Filter Parsing");
  assert(JSON.stringify(parseFilter({ status: "ACTIVE", name: "test" })) === JSON.stringify({ status: "ACTIVE", name: "test" }), "Valid filter");
  assert(JSON.stringify(parseFilter({ status: "", name: "test" })) === JSON.stringify({ name: "test" }), "Empty value removed");
  assert(JSON.stringify(parseFilter({ status: null, name: "test" })) === JSON.stringify({ name: "test" }), "Null value removed");
  assert(JSON.stringify(parseFilter({})) === JSON.stringify({}), "Empty object");
  assert(JSON.stringify(parseFilter(null)) === JSON.stringify({}), "Null input");
  assert(JSON.stringify(parseFilter("string")) === JSON.stringify({}), "Non-object input");

  // Enum Constants
  console.log("\n11. Enum Constants");
  assert(ENGAGEMENT_STATUSES.includes("PLANNED"), "ENGAGEMENT_STATUSES");
  assert(SCAN_STATUSES.includes("READY"), "SCAN_STATUSES");
  assert(SCAN_TYPES.includes("HOST"), "SCAN_TYPES");
  assert(TARGET_STATUSES.includes("ACTIVE"), "TARGET_STATUSES");
  assert(SERVICE_STATES.includes("OPEN"), "SERVICE_STATES");
  assert(FINDING_SEVERITIES.includes("CRITICAL"), "FINDING_SEVERITIES");
  assert(FINDING_STATUSES.includes("OPEN"), "FINDING_STATUSES");
  assert(USER_STATUSES.includes("ACTIVE"), "USER_STATUSES");
  assert(CONTRIBUTOR_TYPES.includes("PENTESTER"), "CONTRIBUTOR_TYPES");
  assert(PROTOCOLS.includes("TCP"), "PROTOCOLS");

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