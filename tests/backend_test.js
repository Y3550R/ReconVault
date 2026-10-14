#!/usr/bin/env node
// Integration test for backend API routes

const BASE_URL = process.env.APP_URL || "http://127.0.0.1:3000";

async function runTests() {
  console.log("=== Backend API Integration Test Suite ===\n");
  console.log(`Testing against: ${BASE_URL}\n`);

  let passed = 0;
  let failed = 0;

  function checkSimple(condition, message) {
    if (condition) {
      console.log(`  ✓ ${message}`);
      passed++;
    } else {
      console.log(`  ✗ ${message}`);
      failed++;
    }
  }

  function checkAdvance(condition, passMessage, failMessage) {
    if (condition) {
      console.log(`  ✓ ${passMessage}`);
      passed++;
    } else {
      console.log(`  ✗ ${failMessage}`);
      failed++;
    }
  }

  async function request(path, options = {}, cookie = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    if (Object.keys(cookie).length > 0) {
      headers["Cookie"] = Object.entries(cookie)
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
    }

    // console.log(options);

    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: headers,
      credentials: "include",
    });

    let data = null;
    const contentType = response.headers.get("content-type");

    if (contentType?.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    const setCookie = response.headers.get("set-cookie");

    let newCookie = { ...cookie };

    if (setCookie) {
      const cookiePair = setCookie.split(";")[0];
      const separator = cookiePair.indexOf("=");

      if (separator !== -1) {
        const name = cookiePair.slice(0, separator);
        const value = cookiePair.slice(separator + 1);

        newCookie[name] = value;
      }
    }

    return {
      status: response.status,
      data,
      newCookie,
    };
  }

  async function doLogin(username, password) {
    const { status, data, newCookie } = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    return { status, data, newCookie };
  }

  const userCookies = {
    admin: null,
    pentester: null,
    client: null,
  };
  let engagementId = null;
  let targetId = null;
  let serviceId = null;
  let findingId = null;
  let scanId = null;

  // Test 0: Health check
  console.log("\n0. Health check");
  try {
    const { status, data } = await request("/health");
    const succeeded = status === 200 && data?.status === "ok";
    checkAdvance(succeeded, "Health check (200)", `Health check failed: ${status}`);
  } catch (e) {
    checkSimple(false, `Health check failed: ${e.message}`);
  }

  // Test 1: Admin login (using DB_DEFAULT_ADMIN_USER from .env)
  console.log("\n1. Admin: Login");
  try {
    const adminUser = process.env.DB_DEFAULT_ADMIN_USER;
    const adminPass = process.env.DB_DEFAULT_ADMIN_PASS;
    const { status, data, newCookie } = await doLogin(adminUser, adminPass);
    const succeeded = status === 200 && data?.success === true;
    checkAdvance(succeeded, "Admin login successful", `Admin login failed: ${status} - ${JSON.stringify(data)}`);
    if (succeeded) {
      userCookies.admin = newCookie;
    }
  } catch (e) {
    checkSimple(false, `Admin login failed: ${e.message}`);
  }

  // Test 2: Admin creates pentester user
  console.log("\n2. Admin: Create pentester user");
  try {
    const { status, data } = await request("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        username: "pentester_test",
        password: "pentestpass123",
        status: "ACTIVE",
        roles: ["pentester"]
      }),
    }, userCookies.admin);
    const succeeded = status === 201 && data?.user?.user_id;
    checkAdvance(succeeded, "Pentester user created", `Pentester user creation failed: ${status} - ${JSON.stringify(data)}`);

  } catch (e) {
    checkSimple(false, `Pentester user creation failed: ${e.message}`);
  }

  // Test 3: Admin creates client user
  console.log("\n3. Admin: Create client user");
  try {
    const { status, data } = await request("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        username: "client_test",
        password: "clientpass123",
        status: "ACTIVE",
        roles: ["client"]
      }),
    }, userCookies.admin);
    const succeeded = status === 201 && data?.user?.user_id;
    checkAdvance(succeeded, "Client user created", `Client user creation failed: ${status} - ${JSON.stringify(data)}`);
  } catch (e) {
    checkSimple(false, `Client user creation failed: ${e.message}`);
  }

  // Test 4: Admin creates an organization
  console.log("\n4. Admin: Create organization");
  try {
    const { status, data } = await request("/api/admin/organizations", {
      method: "POST",
      body: JSON.stringify({
        name: "Test Org.",
        contact_information: "555-0123"
      }),
    }, userCookies.admin);
    const succeeded = status === 201 && data?.organization?.organization_id;
    checkAdvance(succeeded, "Organization created", `Organization creation failed: ${status} - ${JSON.stringify(data)}`)
  } catch (e) {
    checkSimple(false, `Organization creation failed: ${e.message}`);
  }

  // Test 5: Admin assigns client to org
  console.log("\n5. Admin: Assign client to org");
  try {
    // First get the client user ID
    const { data: clientData } = await request("/api/admin/users", {}, userCookies.admin);
    const { data: orgData } = await request("/api/admin/organizations", {}, userCookies.admin);
    const clientUser = clientData.users?.find(u => u.username === "client_test");
    const orgToUse = orgData.orgs?.find(o => o.name === "Test Org.");
    // console.log(orgToUse);
    if (clientUser && orgToUse) {
      const { status } = await request(`/api/admin/users/${clientUser.user_id}/organization`, {
        method: "PUT",
        body: JSON.stringify({ client_organization_id: orgToUse.organization_id }),
      }, userCookies.admin);
      const succeeded = status === 200 || status === 201;
      checkAdvance(succeeded, "Client assigned to org", "Client org assignment failed");
    } else {
      checkSimple(false, "Client user not found");
    }
  } catch (e) {
    checkSimple(false, `Client role assignment failed: ${e.message}`);
  }

  // Test 6: Admin creates engagement
  console.log("\n6. Admin: Create engagement");
  try {
    const { status, data } = await request("/api/engagements", {
      method: "POST",
      body: JSON.stringify({
        name: "Test Engagement",
        description: "Integration test engagement",
        start_date: "2026-01-01",
        end_date: "2026-12-31",
        status: "PLANNED",
      }),
    }, userCookies.admin);
    const succeeded = status === 201 && data?.engagement?.engagement_id;
    checkAdvance(succeeded, "Engagement created", `Engagement creation failed: ${status} - ${JSON.stringify(data)}`);
    engagementId = data.engagement.engagement_id;
  } catch (e) {
    checkSimple(false, `Engagement creation failed: ${e.message}`);
  }

  if (!engagementId) {
    process.exit(1);
  }

  // Test 7: Admin assigns pentester to engagement
  console.log("\n7. Admin: Assign pentester to engagement");
  try {
    // Get pentester user ID
    const { data: usersData } = await request("/api/admin/users", {}, userCookies.admin);
    const pentesterUser = usersData.users?.find(u => u.username === "pentester_test");
    if (pentesterUser) {
      const { status } = await request(`/api/engagements/${engagementId}/members`, {
        method: "POST",
        body: JSON.stringify({ user_id: pentesterUser.user_id }),
      }, userCookies.admin);
      const succeeded = status === 200 || status === 201;
      checkAdvance(succeeded, "Pentester assigned to engagement", `Pentester assignment failed: ${status}`);
    } else {
      checkSimple(false, "Pentester user not found");
    }
  } catch (e) {
    checkSimple(false, `Pentester assignment failed: ${e.message}`);
  }

  // Test 8: Admin assigns client org to engagement
  console.log("\n8. Admin: Assign client org to engagement");
  try {
    const { data: orgData } = await request("/api/admin/organizations", {}, userCookies.admin);
    const orgToUse = orgData.orgs?.find(o => o.name === "Test Org.");
    const { status } = await request(`/api/engagements/${engagementId}/organizations`, {
      method: "POST",
      body: JSON.stringify({ organization_id: orgToUse.organization_id }),
    }, userCookies.admin);
    const succeeded = status === 200 || status === 201;
    checkAdvance(succeeded, "Client org assigned to engagement", `Client org assignment failed: ${status}`);
  } catch (e) {
    checkSimple(false, `Client org assignment failed: ${e.message}`);
  }

  // Test 9: Admin lists engagements
  console.log("\n9. Admin: List engagements");
  try {
    const { status, data } = await request("/api/engagements", {}, userCookies.admin);
    const succeeded = status === 200 && Array.isArray(data?.engagements) && data.engagements.length > 0;
    checkAdvance(succeeded, "Admin list engagements", "Admin list engagements failed");
  } catch (e) {
    checkSimple(failed, `Admin list engagements failed: ${e.message}`);
  }

  // Test 10: Admin updates engagement to ACTIVE
  console.log("\n10. Admin: Update engagement to ACTIVE");
  try {
    const { status, data } = await request(`/api/engagements/${engagementId}`, {
      method: "PUT",
      body: JSON.stringify({ status: "ACTIVE" }),
    }, userCookies.admin);
    const succeeded = status === 200 && data?.engagement?.status === "ACTIVE";
    checkAdvance(succeeded, "Engagement updated to ACTIVE", `Engagement update failed: ${status} - ${JSON.stringify(data)}`);
  } catch (e) {
    checkSimple(failed, `Engagement update failed: ${e.message}`);
  }

  // Test 11: Pentester login
  console.log("\n11. Pentester: Login");
  try {
    const { status, data, newCookie } = await doLogin("pentester_test", "pentestpass123");
    const succeeded = status === 200 && data?.success === true;
    checkAdvance(succeeded, "Pentester login successful", `Pentester login failed: ${status} - ${JSON.stringify(data)}`);
    if (succeeded) {
      userCookies.pentester = newCookie;
    }
  } catch (e) {
    checkSimple(false, `Pentester login failed: ${e.message}`);
  }

  // Test 12: Pentester lists engagements
  console.log("\n12. Pentester: List engagements");
  try {
    const { status, data } = await request("/api/engagements", {}, userCookies.pentester);
    const succeeded = status === 200 && Array.isArray(data?.engagements);
    checkAdvance(succeeded, "Pentester list engagements", "Pentester list engagements failed");
  } catch (e) {
    checkSimple(false, `entester list failed: ${e.message}`);
  }

  // Test 13: Pentester creates target
  console.log("\n13. Pentester: Create target");
  try {
    const { status, data } = await request(`/api/engagements/${engagementId}/targets`, {
      method: "POST",
      body: JSON.stringify({
        ip_type: "IPV4",
        ip_address: "192.168.1.10",
        domain_name: "test.example.com",
        hostname: "test-host",
        status: "ACTIVE",
      }),
    }, userCookies.pentester);
    const succeeded = status === 201 && data?.target?.target_id;
    checkAdvance(succeeded, "Target created", `Target creation failed: ${status} - ${JSON.stringify(data)}`);
    if (succeeded) {
      targetId = data.target.target_id;
    }
  } catch (e) {
    checkSimple(false, `Target creation failed: ${e.message}`);
  }

  // Test 14: Pentester creates service
  console.log("\n14. Pentester: Create service");
  try {
    const { status, data } = await request(`/api/engagements/${engagementId}/targets/${targetId}/services`, {
      method: "POST",
      body: JSON.stringify({
        name: "http",
        port: 80,
        protocol: "TCP",
        state: "OPEN",
      }),
    }, userCookies.pentester);
    const succeeded = status === 201 && data?.service?.service_id;
    checkAdvance(succeeded, "Service created", `Service creation failed: ${status} - ${JSON.stringify(data)}`);
    if (succeeded) {
      serviceId = data.service.service_id;
    }
  } catch (e) {
    checkSimple(false, `Service creation failed: ${e.message}`);
  }

  // Test 15: Pentester creates finding
  console.log("\n15. Pentester: Create finding");
  try {
    const { status, data } = await request(`/api/engagements/${engagementId}/findings`, {
      method: "POST",
      body: JSON.stringify({
        title: "Test Finding",
        description: "Test description",
        severity: "HIGH",
        status: "OPEN",
        target_ids: [targetId],
        service_ids: [serviceId],
      }),
    }, userCookies.pentester);
    const succeeded = status === 201 && data?.finding?.finding_id;
    checkAdvance(succeeded, "Finding created", `Finding creation failed: ${status} - ${JSON.stringify(data)}`);
    if (succeeded) {
      findingId = data.finding.finding_id;
    }
  } catch (e) {
    checkSimple(false, `Finding creation failed: ${e.message}`);
  }

  // Test 16: Pentester creates scan
  console.log("\n16. Pentester: Create scan");
  try {
    const { status, data } = await request(`/api/engagements/${engagementId}/scans`, {
      method: "POST",
      body: JSON.stringify({ scan_type: "PORT" }),
    }, userCookies.pentester);
    const succeeded = status === 201 && data?.scan?.scan_id;
    checkAdvance(succeeded, "Scan created", `Scan creation failed: ${status} - ${JSON.stringify(data)}`);
    if (succeeded) {
      scanId = data.scan.scan_id;
    }
  } catch (e) {
    checkSimple(false, `Scan creation failed: ${e.message}`);
  }

  // Test 17: Client login
  console.log("\n17. Client: Login");
  try {
    const { status, data, newCookie } = await doLogin("client_test", "clientpass123");
    const succeeded = status === 200 && data?.success === true;
    checkAdvance(succeeded, "Client login successful", `Pentester login failed: ${status} - ${JSON.stringify(data)}`);
    if (succeeded) {
      userCookies.client = newCookie;
    }
  } catch (e) {
    checkSimple(false, `Client login failed: ${e.message}`);
  }

  // Test 18: Client lists engagements
  console.log("\n18. Client: List engagements");
  try {
    const { status, data } = await request("/api/engagements", {}, userCookies.client);
    const succeeded = status === 200 && Array.isArray(data?.engagements);
    checkAdvance(succeeded, "Client list engagements", "Client list failed");
  } catch (e) {
    checkSimple(false, `Client list failed: ${e.message}`);
  }

  // Test 19: Client cannot access pentester routes
  console.log("\n19. Client: Cannot create target");
  try {
    const { status } = await request(`/api/engagements/${engagementId}/targets`, {
      method: "POST",
      body: JSON.stringify({ ip_type: "IPV4", ip_address: "192.168.1.20", status: "ACTIVE" }),
    }, userCookies.client);
    const succeeded = status === 403;
    checkAdvance(succeeded, "Client denied target creation (403)", `Client access test failed: ${status}`);
  } catch (e) {
    checkSimple(false, `Client access test failed: ${e.message}`);
  }

  // Test 20: Logout
  console.log("\n20. Logout (Admin)");
  try {
    const { status, data } = await request("/api/auth/logout", { method: "POST" }, userCookies.admin);
    const succeeded = status === 200 && data?.success === true;
    checkAdvance(succeeded, "Logout (200)", `Logout failed: ${status}`);
  } catch (e) {
    checkSimple(false, `Logout failed: ${e.message}`);
  }

  // Test 21: Unauthenticated access denied
  console.log("\n21. Unauthenticated: Access denied");
  try {
    const { status } = await request("/api/engagements", {}, "");
    const succeeded = status === 401;
    checkAdvance(succeeded, "Unauthenticated request returns 401", `Unauthenticated test failed: ${status}`);
  } catch (e) {
    checkSimple(false, `Unauthenticated test failed: ${e.message}`);
  }

  // Test 22: 404 handling
  console.log("\n22. 404 handling");
  try {
    const { status, data } = await request("/api/nonexistent", {}, userCookies.admin);
    const succeeded = status === 404 && data?.error?.code === "NOT_FOUND";
    checkAdvance(succeeded, "404 for unknown route", `404 test failed: ${status}`);
  } catch (e) {
    checkSimple(false, `404 test failed: ${e.message}`);
  }

  // Summary
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
