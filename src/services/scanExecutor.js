
import { spawn } from "node:child_process";
import { isIP } from "node:net";
import { query, execute } from "../db.js";
import { config } from "../config/index.js";
import { AppError } from "../middleware/errorHandler.js";

const runningScans = new Map();
const SUPPORTED_SCAN_TYPES = new Set(["HOST", "PORT"]);
const SUPPORTED_PORT_PROTOCOLS = new Set(["TCP", "UDP", "SCTP"]);

function normalizeId(value, label = "ID") {
  const id = Number(value);

  if (!Number.isSafeInteger(id) || id < 1) {
    throw new AppError(`Invalid ${label}`, 400, "VALIDATION_ERROR");
  }

  return id;
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function isValidHostOrCidr(value, ipType) {
  if (typeof value !== "string" || !value.trim()) return false;

  const [address, prefix, ...extra] = value.trim().split("/");
  if (extra.length || !address) return false;

  const version = isIP(address);
  if (version === 0) return false;
  if (ipType === "IPV4" && version !== 4) return false;
  if (ipType === "IPV6" && version !== 6) return false;

  if (prefix !== undefined) {
    if (!/^\d+$/.test(prefix)) return false;

    const bits = version === 4 ? 32 : 128;
    const prefixLength = Number(prefix);

    if (prefixLength < 0 || prefixLength > bits) return false;
  }

  return true;
}

function validateScan(scan) {
  if (!SUPPORTED_SCAN_TYPES.has(scan.scan_type)) {
    throw new AppError("Unsupported scan type", 400, "VALIDATION_ERROR");
  }

  if (scan.scan_type === "HOST") {
    if (!Array.isArray(scan.hosts) || scan.hosts.length === 0) {
      throw new AppError(
        "HOST scan requires at least one host",
        400,
        "VALIDATION_ERROR"
      );
    }

    for (const host of scan.hosts) {
      if (
        !["IPV4", "IPV6"].includes(host.ip_type) ||
        !isValidHostOrCidr(host.ip_address_or_cidr, host.ip_type)
      ) {
        throw new AppError(
          "HOST scan contains an invalid IP address or CIDR",
          400,
          "VALIDATION_ERROR"
        );
      }
    }
  }

  if (scan.scan_type === "PORT") {
    if (
      !["IPV4", "IPV6"].includes(scan.target_ip_type) ||
      !isValidHostOrCidr(scan.target_ip_address, scan.target_ip_type)
    ) {
      throw new AppError(
        "PORT scan requires a valid target IP address",
        400,
        "VALIDATION_ERROR"
      );
    }

    if (!Array.isArray(scan.ports) || scan.ports.length === 0) {
      throw new AppError(
        "PORT scan requires at least one port range",
        400,
        "VALIDATION_ERROR"
      );
    }

    for (const port of scan.ports) {
      const start = Number(port.port_start);
      const end = Number(port.port_end);
      const protocol = String(port.protocol ?? "").toUpperCase();

      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 1 ||
        end > 65535 ||
        start > end
      ) {
        throw new AppError(
          "Invalid port range",
          400,
          "VALIDATION_ERROR"
        );
      }

      if (!SUPPORTED_PORT_PROTOCOLS.has(protocol)) {
        throw new AppError(
          `Unsupported port protocol: ${protocol || "(empty)"}`,
                           400,
                           "VALIDATION_ERROR"
        );
      }

      port.protocol = protocol;
    }
  }
}

export function isScanRunning(scanId) {
  const id = Number(scanId);
  return Number.isSafeInteger(id) && runningScans.has(id);
}

export function getRunningScansCount() {
  return runningScans.size;
}

export async function startScanExecution(scanIdValue, userId) {
  const scanId = normalizeId(scanIdValue, "scan ID");

  // Reserve the slot before the first await. This prevents duplicate
  // starts for the same scan and local concurrency oversubscription.
  if (runningScans.has(scanId)) {
    throw new AppError(
      "This scan is already starting or running",
      409,
      "SCAN_ALREADY_RUNNING"
    );
  }

  const maxConcurrent = Number(config.scan.maxConcurrent);
  if (
    !Number.isSafeInteger(maxConcurrent) ||
    maxConcurrent < 1 ||
    runningScans.size >= maxConcurrent
  ) {
    throw new AppError(
      `Maximum concurrent scans (${config.scan.maxConcurrent}) reached`,
                       429,
                       "TOO_MANY_REQUESTS"
    );
  }

  const state = {
    scanId,
    engagementId: null,
    process: null,
    timeoutHandle: null,
    startTime: Date.now(),
    cancelRequested: false,
    timedOut: false,
    finalized: false,
    spawnError: null,
    stdout: "",
    stderr: "",
    done: null,
    resolveDone: null,
    rejectDone: null,
  };

  state.done = new Promise((resolve, reject) => {
    state.resolveDone = resolve;
    state.rejectDone = reject;
  });

  // Avoid an unhandled rejection if a caller doesn't await execution.
  state.done.catch(() => {});
  runningScans.set(scanId, state);

  let databaseMarkedRunning = false;

  try {
    const rows = await query(
      `SELECT s.*, e.name AS engagement_name
      FROM scans s
      JOIN engagements e
      ON e.engagement_id = s.engagement_id
      WHERE s.scan_id = ?`,
      [scanId]
    );

    if (!rows.length) {
      throw new AppError("Scan not found", 404, "NOT_FOUND");
    }

    const scan = rows[0];
    state.engagementId = normalizeId(scan.engagement_id, "engagement ID");

    if (scan.status !== "READY") {
      throw new AppError(
        "Scan can only be started from READY status",
        400,
        "VALIDATION_ERROR"
      );
    }

    if (scan.scan_type === "HOST") {
      scan.hosts = await query(
        `SELECT ip_type, ip_address_or_cidr
        FROM scan_hosts
        WHERE scan_id = ?`,
        [scanId]
      );
    } else if (scan.scan_type === "PORT") {
      scan.ports = await query(
        `SELECT port_start, port_end, protocol
        FROM scan_ports
        WHERE scan_id = ?`,
        [scanId]
      );
    }

    validateScan(scan);

    // Conditional update makes the READY -> RUNNING transition
    // atomic across competing requests.
    const updateResult = await execute(
      `UPDATE scans
      SET status = 'RUNNING',
      runner_user_id = ?,
      runner_pid = NULL,
      started_at = NOW(),
                                       finished_at = NULL,
                                       error_message = NULL,
                                       updated_at = NOW()
                                       WHERE scan_id = ? AND status = 'READY'`,
                                       [userId, scanId]
    );

    if (updateResult.affectedRows !== 1) {
      throw new AppError(
        "Scan is no longer READY",
        409,
        "SCAN_STATE_CONFLICT"
      );
    }

    databaseMarkedRunning = true;

    const command = buildNmapCommand(scan);
    const child = spawnNmap(command, state);
    state.process = child;

    if (!child.pid) {
      throw new Error("Nmap process did not provide a PID");
    }

    await execute(
      `UPDATE scans
      SET runner_pid = ?, updated_at = NOW()
      WHERE scan_id = ? AND status = 'RUNNING'`,
      [child.pid, scanId]
    );

    state.timeoutHandle = setTimeout(() => {
      timeoutScan(scanId).catch((error) => {
        console.error(`Failed to process timeout for scan ${scanId}:`, error);
      });
    }, Number(config.scan.timeoutMs));

    child.once("error", (error) => {
      state.spawnError = error;
    });

    child.once("close", (code, signal) => {
      finishScan(state, code, signal).catch((error) => {
        console.error(`Failed to finalize scan ${scanId}:`, error);
      });
    });

    // Resolve when the scan reaches a terminal state.
    return await state.done;
  } catch (error) {
    if (state.process && !state.process.closed) {
      state.process.kill("SIGKILL");
    }

    if (state.timeoutHandle) clearTimeout(state.timeoutHandle);

    if (databaseMarkedRunning) {
      try {
        await execute(
          `UPDATE scans
          SET status = 'FAILED',
          error_message = ?,
          runner_pid = NULL,
          finished_at = NOW(),
                      updated_at = NOW()
                      WHERE scan_id = ? AND status = 'RUNNING'`,
                      [String(error.message || "Failed to start scan").slice(0, 4000), scanId]
        );
      } catch (dbError) {
        console.error(`Failed to update scan ${scanId} after startup error:`, dbError);
      }
    }

    if (runningScans.get(scanId) === state) {
      runningScans.delete(scanId);
    }

    throw error;
  }
}

function buildNmapCommand(scan) {
  const args = [];

  if (scan.scan_type === "HOST") {
    args.push(
      "-sn",
      "-PE",
      "-PS22,80,443",
      "-PA22,80,443",
      "-PU53,161",
      "--disable-arp-ping"
    );

    for (const host of scan.hosts) {
      args.push(host.ip_address_or_cidr);
    }
  } else if (scan.scan_type === "PORT") {
    const protocols = new Set(scan.ports.map(
      (port) => String(port.protocol).toUpperCase()
    ));

    if (protocols.has("TCP")) args.push("-sT");
    if (protocols.has("UDP")) args.push("-sU");
    if (protocols.has("SCTP")) args.push("-sY");

    const portSpec = scan.ports.map((port) => {
      const prefix = {
        TCP: "T",
        UDP: "U",
        SCTP: "S",
      }[String(port.protocol).toUpperCase()];

      const start = Number(port.port_start);
      const end = Number(port.port_end);
      return `${prefix}:${start === end ? start : `${start}-${end}`}`;
    }).join(",");

    args.push("-p", portSpec);

    if (protocols.has("TCP") || protocols.has("UDP")) {
      args.push("-sV", "--version-intensity", "5");
    }

    args.push(scan.target_ip_address);
  } else {
    throw new AppError("Unsupported scan type", 400, "VALIDATION_ERROR");
  }

  args.push("-oX", "-");

  return { command: config.nmap.path, args };
}

function spawnNmap({ command, args }, state) {
  const child = spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });

  state.stdout = "";
  state.stderr = "";

  child.stdout?.on("data", (data) => {
    state.stdout += data.toString();
  });

  child.stderr?.on("data", (data) => {
    state.stderr += data.toString();
  });

  return child;
}

async function finishScan(state, code, signal) {
  if (state.finalized) return;
  state.finalized = true;

  if (state.timeoutHandle) clearTimeout(state.timeoutHandle);

  const { scanId } = state;
  let status;
  let errorMessage = null;

  try {
    if (state.cancelRequested) {
      status = "CANCELLED";
      errorMessage = "Cancelled by user";
    } else if (state.timedOut) {
      status = "FAILED";
      errorMessage = "Scan timed out";
    } else if (state.spawnError) {
      status = "FAILED";
      errorMessage = state.spawnError.message;
    } else if (code !== 0) {
      status = "FAILED";
      errorMessage =
      state.stderr ||
      `Nmap exited with code ${code}${signal ? ` (signal: ${signal})` : ""}`;
    } else {
      try {
        if (!state.stdout.includes("<nmaprun")) {
          throw new Error("Nmap did not produce valid XML output");
        }

        await parseAndStoreResults(
          scanId,
          state.engagementId,
          state.stdout
        );

        status = "COMPLETED";
      } catch (error) {
        status = "FAILED";
        errorMessage = error.message || "Failed to process Nmap results";
      }
    }

    await execute(
      `UPDATE scans
      SET status = ?,
      error_message = ?,
      nmap_output = ?,
      runner_pid = NULL,
      finished_at = NOW(),
                  updated_at = NOW()
                  WHERE scan_id = ? AND status = 'RUNNING'`,
                  [
                    status,
                  errorMessage ? String(errorMessage).slice(0, 4000) : null,
                  state.stdout,
                  scanId,
                  ]
    );

    state.resolveDone({ status });
  } catch (error) {
    state.rejectDone(error);
  } finally {
    if (runningScans.get(scanId) === state) {
      runningScans.delete(scanId);
    }
  }
}

async function timeoutScan(scanId) {
  const state = runningScans.get(scanId);
  if (!state || state.finalized || state.cancelRequested) return;

  state.timedOut = true;

  const child = state.process;
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
  }

  // The close handler performs the final DB update so timeout and
  // completion cannot independently overwrite each other's outcome.
}

export async function cancelScanExecution(scanIdValue) {
  const scanId = normalizeId(scanIdValue, "scan ID");
  const state = runningScans.get(scanId);

  if (!state || state.finalized) return false;

  state.cancelRequested = true;

  if (state.timeoutHandle) {
    clearTimeout(state.timeoutHandle);
    state.timeoutHandle = null;
  }

  const child = state.process;

  if (!child) {
    // The scan is still being prepared. Its startup path will see
    // the cancellation flag before spawning.
    return true;
  }

  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");

    const exited = await waitForCloseOrDelay(child, 2000);

    if (!exited && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
  }

  // Await the one finalizer registered on the process close event.
  try {
    await state.done;
  } catch {
    // The finalizer error is logged at the close handler.
  }

  return true;
}

function waitForCloseOrDelay(child, delayMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    let settled = false;

    const finish = (exited) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("close", onClose);
      resolve(exited);
    };

    const onClose = () => finish(true);
    const timer = setTimeout(() => finish(false), delayMs);

    child.once("close", onClose);
  });
}

async function parseAndStoreResults(scanId, engagementId, xmlOutput) {
  const { parseStringPromise } = await import("xml2js");

  let result;
  try {
    result = await parseStringPromise(xmlOutput, {
      explicitArray: false,
      mergeAttrs: true,
    });
  } catch (error) {
    throw new AppError(
      `Failed to parse Nmap XML: ${error.message}`,
      500,
      "PARSE_ERROR"
    );
  }

  const nmapRun = result?.nmaprun;
  if (!nmapRun) {
    throw new AppError("Nmap XML is missing nmaprun", 500, "PARSE_ERROR");
  }

  if (!nmapRun.host) return;

  const hosts = Array.isArray(nmapRun.host)
  ? nmapRun.host
  : [nmapRun.host];

  const contributorResult = await execute(
    `INSERT INTO contributors (contributor_type, scan_id)
    VALUES ('SCAN', ?)`,
                                          [scanId]
  );

  const contributorId = contributorResult.insertId;

  for (const host of hosts) {
    if (host.status?.state !== "up") continue;

    const addresses = Array.isArray(host.address)
    ? host.address
    : [host.address].filter(Boolean);

    const ipAddr = addresses.find(
      (address) =>
      address.addrtype === "ipv4" ||
      address.addrtype === "ipv6"
    );

    if (!ipAddr?.addr) continue;

    const ipType = ipAddr.addrtype === "ipv6" ? "IPV6" : "IPV4";
    const ipAddress = ipAddr.addr;

    let hostname = null;
    if (host.hostnames?.hostname) {
      const names = Array.isArray(host.hostnames.hostname)
      ? host.hostnames.hostname
      : [host.hostnames.hostname];

      hostname = names[0]?.name ?? null;
    }

    let osName = null;
    if (host.os?.osmatch) {
      const matches = Array.isArray(host.os.osmatch)
      ? host.os.osmatch
      : [host.os.osmatch];

      osName = matches[0]?.name ?? null;
    }

    // IMPORTANT: use engagementId, not scanId.
    await execute(
      `INSERT INTO targets
      (engagement_id, ip_type, ip_address, hostname, operating_system, status)
      VALUES (?, ?, ?, ?, ?, 'ACTIVE')
      ON DUPLICATE KEY UPDATE
      hostname = VALUES(hostname),
                  operating_system = VALUES(operating_system),
                  status = 'ACTIVE',
                  updated_at = NOW()`,
                  [engagementId, ipType, ipAddress, hostname, osName]
    );

    // Query the ID explicitly; affectedRows/insertId behavior varies
    // by MySQL driver and connection options.
    const targetRows = await query(
      `SELECT target_id
      FROM targets
      WHERE engagement_id = ? AND ip_address = ? AND ip_type = ?
      LIMIT 1`,
      [engagementId, ipAddress, ipType]
    );

    const targetId = targetRows[0]?.target_id;
    if (!targetId) {
      throw new Error(`Could not retrieve target ID for ${ipAddress}`);
    }

    await execute(
      `INSERT IGNORE INTO target_contributors (contributor_id, target_id)
      VALUES (?, ?)`,
                  [contributorId, targetId]
    );

    if (!host.ports?.port) continue;

    const ports = Array.isArray(host.ports.port)
    ? host.ports.port
    : [host.ports.port];

    for (const port of ports) {
      if (port.state?.state !== "open") continue;

      const portNum = Number.parseInt(port.portid, 10);
      const protocol = String(port.protocol ?? "tcp").toUpperCase();

      if (
        !Number.isInteger(portNum) ||
        portNum < 1 ||
        portNum > 65535 ||
        !["TCP", "UDP", "SCTP"].includes(protocol)
      ) {
        continue;
      }

      const serviceName = port.service?.name || "unknown";
      const serviceVersion = port.service?.version || null;

      await execute(
        `INSERT INTO services
        (target_id, name, port, protocol, version, state)
        VALUES (?, ?, ?, ?, ?, 'OPEN')
        ON DUPLICATE KEY UPDATE
        name = VALUES(name),
                    version = VALUES(version),
                    state = 'OPEN',
                    updated_at = NOW()`,
                    [targetId, serviceName, portNum, protocol, serviceVersion]
      );

      const serviceRows = await query(
        `SELECT service_id
        FROM services
        WHERE target_id = ? AND port = ? AND protocol = ?
        LIMIT 1`,
        [targetId, portNum, protocol]
      );

      const serviceId = serviceRows[0]?.service_id;
      if (!serviceId) {
        throw new Error(
          `Could not retrieve service ID for target ${targetId}, port ${portNum}`
        );
      }

      await execute(
        `INSERT IGNORE INTO service_contributors (contributor_id, service_id)
        VALUES (?, ?)`,
                    [contributorId, serviceId]
      );
    }
  }
}

export async function recoverOrphanedScans() {
  const result = await execute(
    `UPDATE scans
    SET status = 'FAILED',
    error_message = 'App restarted during scan',
    runner_pid = NULL,
    finished_at = NOW(),
                               updated_at = NOW()
                               WHERE status = 'RUNNING'`
  );

  return result.affectedRows ?? 0;
}

export async function cancelAllRunningScans() {
  const ids = [...runningScans.keys()];
  let cancelled = 0;

  for (const scanId of ids) {
    try {
      const result = await cancelScanExecution(scanId);
      if (result) cancelled++;
    } catch (error) {
      console.error(`Failed to cancel scan ${scanId} during shutdown:`, error);
    }
  }

  // Also reset rows left behind by a previous process instance.
  // Do not signal arbitrary PIDs from the database: PID reuse can
  // cause this application to kill an unrelated process.
  const result = await execute(
    `UPDATE scans
    SET status = 'CANCELLED',
    error_message = 'App shutdown',
    runner_pid = NULL,
    finished_at = NOW(),
                               updated_at = NOW()
                               WHERE status = 'RUNNING'`
  );

  return Math.max(cancelled, result.affectedRows ?? 0);
}
