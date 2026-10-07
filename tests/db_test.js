import { createPool, query, execute, transaction, paginate, buildWhere, buildOrderBy, setCurrentUserId, clearCurrentUserId, close } from "../src/db.js";
import { config } from "../src/config/index.js";

async function runTests() {
  console.log("=== Database Test Suite ===\n");

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

  // Test 1: Connection
  console.log("\n1. Connection Tests");
  try {
    const rows = await query("SELECT 1 AS test");
    assert(rows[0].test === 1, "Basic query works");
  } catch (e) {
    assert(false, `Basic query failed: ${e.message}`);
  }

  // Test 2: Tables exist
  console.log("\n2. Schema Tests");
  const tables = await query("SHOW TABLES");
  const tableNames = tables.map(t => Object.values(t)[0]);
  const expectedTables = [
    "users", "administrators", "pentesters", "clients", "client_organizations",
    "engagements", "engagement_members", "engagement_organizations",
    "targets", "services", "findings", "finding_targets", "finding_services",
    "contributors", "target_contributors", "service_contributors", "finding_contributors",
    "scans", "sessions"
  ];
  for (const t of expectedTables) {
    assert(tableNames.includes(t), `Table ${t} exists`);
  }

  // Test 3: Triggers exist
  console.log("\n3. Trigger Tests");
  const triggers = await query("SHOW TRIGGERS");
  const triggerNames = triggers.map(t => t.Trigger);
  const expectedTriggers = [
    "trg_target_after_insert", "trg_target_after_update",
    "trg_service_after_insert", "trg_service_after_update",
    "trg_finding_after_insert", "trg_finding_after_update",
    "trg_scan_before_update"
  ];
  for (const t of expectedTriggers) {
    assert(triggerNames.includes(t), `Trigger ${t} exists`);
  }

  // Test 4: Foreign keys
  console.log("\n4. Foreign Key Tests");
  const fks = await query(`
    SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE REFERENCED_TABLE_SCHEMA = 'reconvault' AND TABLE_SCHEMA = 'reconvault'
  `);
  assert(fks.length > 0, `Foreign keys exist (${fks.length} found)`);

  // Test 5: Insert user
  console.log("\n5. CRUD Tests");
  const testSuffix = Date.now();
  let userId = null;
  try {
    const result = await execute(
      "INSERT INTO users (username, password_hash, status) VALUES (?, ?, ?)",
      [`testuser_${testSuffix}`, "$argon2id$v=19$m=65536,t=3,p=4$salt$hash", "ACTIVE"]
    );
    userId = result.insertId;
    assert(userId > 0, "User insert works");
  } catch (e) {
    assert(false, `User insert failed: ${e.message}`);
  }

  // Test 6: Role assignment
  if (userId) {
    try {
      await execute("INSERT INTO administrators (user_id) VALUES (?)", [userId]);
      const admin = await query("SELECT 1 FROM administrators WHERE user_id = ?", [userId]);
      assert(admin.length === 1, "Admin role assignment works");
    } catch (e) {
      assert(false, `Admin role failed: ${e.message}`);
    }
  }

  // Test 7: Engagement CRUD
  let engagementId = null;
  if (userId) {
    try {
      const result = await execute(
        "INSERT INTO engagements (name, description, start_date, status) VALUES (?, ?, ?, ?)",
        ["Test Engagement", "Description", "2026-01-01", "PLANNED"]
      );
      engagementId = result.insertId;
      assert(engagementId > 0, "Engagement insert works");

      await execute("INSERT INTO engagement_members (engagement_id, user_id) VALUES (?, ?)", [engagementId, userId]);
      const member = await query("SELECT 1 FROM engagement_members WHERE engagement_id = ? AND user_id = ?", [engagementId, userId]);
      assert(member.length === 1, "Engagement member assignment works");
    } catch (e) {
      assert(false, `Engagement CRUD failed: ${e.message}`);
    }
  }

  // Test 8: Target CRUD
  let targetId = null;
  if (engagementId) {
    try {
      const result = await execute(
        "INSERT INTO targets (engagement_id, ip_type, ip_address, status) VALUES (?, ?, ?, ?)",
        [engagementId, "IPV4", "192.168.1.1", "ACTIVE"]
      );
      targetId = result.insertId;
      assert(targetId > 0, "Target insert works");
    } catch (e) {
      assert(false, `Target insert failed: ${e.message}`);
    }
  }

  // Test 9: Trigger - contributor tracking on target insert
  console.log("\n6. Trigger Tests (Runtime)");
  if (targetId) {
    try {
      await setCurrentUserId(userId);
      await execute("UPDATE targets SET description = ? WHERE target_id = ?", ["Updated via trigger test", targetId]);
      const contributors = await query(
        "SELECT c.* FROM contributors c JOIN target_contributors tc ON c.contributor_id = tc.contributor_id WHERE tc.target_id = ?",
        [targetId]
      );
      assert(contributors.length > 0, "Target update trigger creates contributor");
      const contrib = contributors[contributors.length - 1];
      assert(contrib.contributor_type === "PENTESTER", "Contributor type is PENTESTER");
      assert(contrib.user_id === userId, "Contributor user_id matches");
    } catch (e) {
      assert(false, `Target trigger test failed: ${e.message}`);
    } finally {
      await clearCurrentUserId();
    }
  }

  // Test 10: Service CRUD + trigger
  let serviceId = null;
  if (targetId) {
    try {
      await setCurrentUserId(userId);
      const result = await execute(
        "INSERT INTO services (target_id, name, port, protocol, state) VALUES (?, ?, ?, ?, ?)",
        [targetId, "http", 80, "TCP", "OPEN"]
      );
      serviceId = result.insertId;
      assert(serviceId > 0, "Service insert works");

      const contributors = await query(
        "SELECT c.* FROM contributors c JOIN service_contributors sc ON c.contributor_id = sc.contributor_id WHERE sc.service_id = ?",
        [serviceId]
      );
      assert(contributors.length > 0, "Service insert trigger creates contributor");
    } catch (e) {
      assert(false, `Service trigger test failed: ${e.message}`);
    } finally {
      await clearCurrentUserId();
    }
  }

  // Test 11: Finding CRUD + trigger + junctions
  let findingId = null;
  if (engagementId && userId) {
    try {
      await setCurrentUserId(userId);
      const result = await execute(
        "INSERT INTO findings (engagement_id, title, description, severity, status, creator_user_id) VALUES (?, ?, ?, ?, ?, ?)",
        [engagementId, "Test Finding", "Description", "HIGH", "OPEN", userId]
      );
      findingId = result.insertId;
      assert(findingId > 0, "Finding insert works");

      await execute("INSERT INTO finding_targets (finding_id, target_id) VALUES (?, ?)", [findingId, targetId]);
      await execute("INSERT INTO finding_services (finding_id, service_id) VALUES (?, ?)", [findingId, serviceId]);

      const targets = await query("SELECT * FROM finding_targets WHERE finding_id = ?", [findingId]);
      assert(targets.length === 1, "Finding-target junction works");

      const services = await query("SELECT * FROM finding_services WHERE finding_id = ?", [findingId]);
      assert(services.length === 1, "Finding-service junction works");
    } catch (e) {
      assert(false, `Finding CRUD failed: ${e.message}`);
    } finally {
      await clearCurrentUserId();
    }
  }

  // Test 12: Scan CRUD + status trigger
  let scanId = null;
  if (engagementId && userId) {
    try {
      const result = await execute(
        "INSERT INTO scans (engagement_id, creator_user_id, scan_type, status) VALUES (?, ?, ?, ?)",
        [engagementId, userId, "PORT", "READY"]
      );
      scanId = result.insertId;
      assert(scanId > 0, "Scan insert works");

      await execute("UPDATE scans SET status = ? WHERE scan_id = ?", ["RUNNING", scanId]);
      let scan = await query("SELECT * FROM scans WHERE scan_id = ?", [scanId]);
      assert(scan[0].status === "RUNNING", "Scan status update to RUNNING works");
      assert(scan[0].started_at === null, "started_at not auto-set (app responsibility)");

      await execute("UPDATE scans SET status = ? WHERE scan_id = ?", ["COMPLETED", scanId]);
      scan = await query("SELECT * FROM scans WHERE scan_id = ?", [scanId]);
      assert(scan[0].status === "COMPLETED", "Scan status update to COMPLETED works");
      assert(scan[0].finished_at !== null, "Trigger sets finished_at on COMPLETED");
    } catch (e) {
      assert(false, `Scan trigger test failed: ${e.message}`);
    }
  }

  // Test 13: Helper functions
  console.log("\n7. Helper Function Tests");
  try {
    const { where, params } = buildWhere({ status: "ACTIVE", ip_type: "IPV4" }, "t");
    assert(where === "WHERE t.status = ? AND t.ip_type = ?", "buildWhere basic");
    assert(params.length === 2 && params[0] === "ACTIVE" && params[1] === "IPV4", "buildWhere params");

    const { where: where2, params: params2 } = buildWhere({ status: ["ACTIVE", "INACTIVE"] });
    assert(where2 === "WHERE status IN (?,?)", "buildWhere IN clause");
  } catch (e) {
    assert(false, `buildWhere failed: ${e.message}`);
  }

  try {
    const order = buildOrderBy("created_at:desc", ["created_at", "updated_at", "name"]);
    assert(order === "ORDER BY created_at DESC", "buildOrderBy desc");
    const order2 = buildOrderBy("name:asc", ["created_at", "name"]);
    assert(order2 === "ORDER BY name ASC", "buildOrderBy asc");
    const order3 = buildOrderBy("invalid:desc", ["created_at", "name"]);
    assert(order3 === "", "buildOrderBy rejects invalid field");
  } catch (e) {
    assert(false, `buildOrderBy failed: ${e.message}`);
  }

  // Test 14: Transaction rollback
  console.log("\n8. Transaction Tests");
  try {
    let txUserId = null;
    await transaction(async (conn) => {
      const result = await conn.execute(
        "INSERT INTO users (username, password_hash, status) VALUES (?, ?, ?)",
        ["txuser", "hash", "ACTIVE"]
      );
      txUserId = result[0].insertId;
      throw new Error("Force rollback");
    });
    assert(false, "Transaction should have thrown");
  } catch (e) {
    if (e.message === "Force rollback") {
      const users = await query("SELECT * FROM users WHERE username = ?", ["txuser"]);
      assert(users.length === 0, "Transaction rollback works");
    } else {
      assert(false, `Transaction test failed: ${e.message}`);
    }
  }

  // Test 15: Pagination
  console.log("\n9. Pagination Test");
  try {
    const result = await paginate("SELECT * FROM users WHERE status = ?", ["ACTIVE"], 1, 10);
    assert(result.data.length >= 0, "Paginate returns data");
    assert(result.pagination.page === 1, "Paginate page correct");
    assert(result.pagination.limit === 10, "Paginate limit correct");
    assert(typeof result.pagination.total === "number", "Paginate total is number");
  } catch (e) {
    assert(false, `Pagination failed: ${e.message}`);
  }

  // Test 16: Scan contributor type
  console.log("\n10. Scan Contributor Type Test");
  if (scanId) {
    try {
      await setCurrentUserId(null); // scan contributors don't use user_id
      await execute(
        "INSERT INTO contributors (contributor_type, scan_id) VALUES (?, ?)",
        ["SCAN", scanId]
      );
      const contrib = await query(
        "SELECT * FROM contributors WHERE scan_id = ? AND contributor_type = ?",
        [scanId, "SCAN"]
      );
      assert(contrib.length === 1, "Scan contributor insert works");
      assert(contrib[0].user_id === null, "Scan contributor has no user_id");
      assert(contrib[0].scan_id === scanId, "Scan contributor links to scan");
    } catch (e) {
      assert(false, `Scan contributor test failed: ${e.message}`);
    } finally {
      await clearCurrentUserId();
    }
  }

  // Cleanup
  // console.log("\n11. Cleanup");
  // try {
  //   await execute("DELETE FROM users WHERE username LIKE ?", [`testuser_${testSuffix}%`]);
  //   await execute("DELETE FROM users WHERE username = ?", ["txuser"]);
  //   console.log("  ✓ Test data cleaned up");
  // } catch (e) {
  //   console.log(`  ⚠ Cleanup warning: ${e.message}`);
  // }
  // (Deprecated: runServer_test.sh handles cleanup)

  // Summary
  console.log("\n=== Test Summary ===");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);

  await close();

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(async (e) => {
  console.error("Test suite crashed:", e);
  await close();
  process.exit(1);
});
