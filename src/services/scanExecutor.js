import { spawn } from "child_process";
import { query, execute } from "../db.js";
import { config } from "../config/index.js";
import { AppError } from "../middleware/errorHandler.js";

const runningScans = new Map();

export function isScanRunning(scanId) {
  return runningScans.has(scanId);
}

export function getRunningScansCount() {
  return runningScans.size;
}

export async function startScanExecution(scanId, userId) {
  const scan = await query(
    `SELECT s.*, e.name as engagement_name
     FROM scans s
     JOIN engagements e ON s.engagement_id = e.engagement_id
     WHERE s.scan_id = ?`,
    [scanId]
  );
  if (!scan.length) {
    throw new AppError("Scan not found", 404, "NOT_FOUND");
  }
  const scanData = scan[0];

  if (scanData.status !== "READY") {
    throw new AppError("Scan can only be started from READY status", 400, "VALIDATION_ERROR");
  }

  if (scanData.scan_type === "HOST") {
    const hosts = await query("SELECT * FROM scan_hosts WHERE scan_id = ?", [scanId]);
    if (!hosts.length) {
      throw new AppError("HOST scan requires at least one host in scan_hosts", 400, "VALIDATION_ERROR");
    }
    scanData.hosts = hosts;
  } else if (scanData.scan_type === "PORT") {
    const ports = await query("SELECT * FROM scan_ports WHERE scan_id = ?", [scanId]);
    if (!ports.length) {
      throw new AppError("PORT scan requires at least one port range in scan_ports", 400, "VALIDATION_ERROR");
    }
    if (!scanData.target_ip_address || !scanData.target_ip_type) {
      throw new AppError("PORT scan requires target_ip_address and target_ip_type", 400, "VALIDATION_ERROR");
    }
    scanData.ports = ports;
  }

  if (runningScans.size >= config.scan.maxConcurrent) {
    throw new AppError(
      `Maximum concurrent scans (${config.scan.maxConcurrent}) reached`,
      429,
      "TOO_MANY_REQUESTS"
    );
  }

  await execute(
    "UPDATE scans SET status = 'RUNNING', runner_user_id = ?, started_at = NOW(), updated_at = NOW() WHERE scan_id = ?",
    [userId, scanId]
  );

  const nmapCommand = buildNmapCommand(scanData);
  const childProcess = spawnNmap(nmapCommand, scanId);

  runningScans.set(scanId, {
    process: childProcess,
    scanId,
    startTime: Date.now(),
    timeoutHandle: null,
  });

  const timeoutHandle = setTimeout(() => {
    handleScanTimeout(scanId);
  }, config.scan.timeoutMs);

  runningScans.get(scanId).timeoutHandle = timeoutHandle;

  return new Promise((resolve, reject) => {
    childProcess.on("exit", async (code, signal) => {
      clearTimeout(timeoutHandle);
      runningScans.delete(scanId);

      try {
        await handleScanCompletion(scanId, code, signal);
        resolve();
      } catch (err) {
        reject(err);
      }
    });

    childProcess.on("error", async (err) => {
      clearTimeout(timeoutHandle);
      runningScans.delete(scanId);
      await handleScanError(scanId, err);
      reject(err);
    });
  });
}

function buildNmapCommand(scan) {
  const args = [];

  if (scan.scan_type === "HOST") {
    args.push("-sn");
    args.push("-PE", "-PS22,80,443", "-PA22,80,443", "-PU53,161");
    args.push("--disable-arp-ping");

    const hosts = scan.hosts || [];
    for (const h of hosts) {
      args.push(h.ip_address_or_cidr);
    }
  } else if (scan.scan_type === "PORT") {
    args.push("-sT");
    args.push("-sV", "--version-intensity", "5");

    const ports = scan.ports || [];
    const portRanges = ports.map(p => `${p.port_start}-${p.port_end}`).join(",");
    args.push("-p", portRanges);

    args.push(scan.target_ip_address);
  }

  args.push("-oX", "-");

  return { command: config.nmap.path, args };
}

function spawnNmap({ command, args }, scanId) {
  const child = spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (data) => {
    stdout += data.toString();
  });

  child.stderr.on("data", (data) => {
    stderr += data.toString();
  });

  child.on("close", () => {
    child.stdoutData = stdout;
    child.stderrData = stderr;
  });

  return child;
}

async function handleScanTimeout(scanId) {
  const scanInfo = runningScans.get(scanId);
  if (!scanInfo) return;

  const { process: child } = scanInfo;
  if (child && !child.killed) {
    child.kill("SIGKILL");
  }

  await execute(
    `UPDATE scans 
     SET status = 'FAILED', 
         error_message = 'Scan timed out', 
         runner_pid = NULL,
         finished_at = NOW(),
         updated_at = NOW()
     WHERE scan_id = ?`,
    [scanId]
  );

  runningScans.delete(scanId);
}

async function handleScanCompletion(scanId, code, signal) {
  const scanInfo = runningScans.get(scanId);
  const stdout = scanInfo?.process?.stdoutData || "";
  const stderr = scanInfo?.process?.stderrData || "";

  if (code === 0 || (stdout && stdout.includes("<nmaprun"))) {
    await parseAndStoreResults(scanId, stdout);
    await execute(
      `UPDATE scans 
       SET status = 'COMPLETED', 
           nmap_output = ?, 
           runner_pid = NULL,
           finished_at = NOW(),
           updated_at = NOW()
       WHERE scan_id = ?`,
      [stdout, scanId]
    );
  } else {
    const errorMsg = stderr || `nmap exited with code ${code}${signal ? ` (signal: ${signal})` : ""}`;
    await execute(
      `UPDATE scans 
       SET status = 'FAILED', 
           error_message = ?, 
           nmap_output = ?,
           runner_pid = NULL,
           finished_at = NOW(),
           updated_at = NOW()
       WHERE scan_id = ?`,
      [errorMsg, stdout, scanId]
    );
  }
}

async function handleScanError(scanId, err) {
  await execute(
    `UPDATE scans 
     SET status = 'FAILED', 
         error_message = ?, 
         runner_pid = NULL,
         finished_at = NOW(),
         updated_at = NOW()
     WHERE scan_id = ?`,
    [err.message, scanId]
  );
}

async function parseAndStoreResults(scanId, xmlOutput) {
  const { parseStringPromise } = await import("xml2js");

  let result;
  try {
    result = await parseStringPromise(xmlOutput, { explicitArray: false, mergeAttrs: true });
  } catch (parseErr) {
    throw new AppError(`Failed to parse nmap XML: ${parseErr.message}`, 500, "PARSE_ERROR");
  }

  const nmapRun = result?.nmaprun;
  if (!nmapRun || !nmapRun.host) return;

  const hosts = Array.isArray(nmapRun.host) ? nmapRun.host : [nmapRun.host];

  const contribResult = await execute(
    "INSERT INTO contributors (contributor_type, scan_id) VALUES ('SCAN', ?)",
    [scanId]
  );
  const contributorId = contribResult.insertId;

  for (const host of hosts) {
    if (host.status?.state !== "up") continue;

    const address = host.address;
    const ipAddr = Array.isArray(address) ? address.find(a => a.addrtype === "ipv4" || a.addrtype === "ipv6") : address;
    if (!ipAddr?.addr) continue;

    const ipType = ipAddr.addrtype === "ipv6" ? "IPV6" : "IPV4";
    const ipAddress = ipAddr.addr;

    let hostname = null;
    if (host.hostnames?.hostname) {
      const hn = Array.isArray(host.hostnames.hostname) ? host.hostnames.hostname[0] : host.hostnames.hostname;
      hostname = hn.name;
    }

    let osName = null;
    if (host.os?.osmatch) {
      const osMatches = Array.isArray(host.os.osmatch) ? host.os.osmatch : [host.os.osmatch];
      if (osMatches.length > 0) {
        osName = osMatches[0].name;
      }
    }

    const targetResult = await execute(
      `INSERT INTO targets (engagement_id, ip_type, ip_address, hostname, operating_system, status)
       VALUES (?, ?, ?, ?, ?, 'ACTIVE')
       ON DUPLICATE KEY UPDATE
         hostname = VALUES(hostname),
         operating_system = VALUES(operating_system),
         status = 'ACTIVE',
         updated_at = NOW()`,
      [scanId, ipType, ipAddress, hostname, osName]
    );

    let targetId = targetResult.insertId;
    if (targetResult.affectedRows === 2) {
      const existing = await query(
        "SELECT target_id FROM targets WHERE engagement_id = ? AND ip_address = ? AND ip_type = ?",
        [scanId, ipAddress, ipType]
      );
      targetId = existing[0]?.target_id;
    }

    if (targetId) {
      await execute(
        "INSERT IGNORE INTO target_contributors (contributor_id, target_id) VALUES (?, ?)",
        [contributorId, targetId]
      );
    }

    if (targetId && host.ports?.port) {
      const ports = Array.isArray(host.ports.port) ? host.ports.port : [host.ports.port];
      for (const port of ports) {
        if (port.state?.state !== "open") continue;

        const portNum = parseInt(port.portid, 10);
        const protocol = port.protocol || "TCP";
        const serviceName = port.service?.name || "unknown";
        const serviceVersion = port.service?.version || null;

        const serviceResult = await execute(
          `INSERT INTO services (target_id, name, port, protocol, version, state)
           VALUES (?, ?, ?, ?, ?, 'OPEN')
           ON DUPLICATE KEY UPDATE
             name = VALUES(name),
             version = VALUES(version),
             state = 'OPEN',
             updated_at = NOW()`,
          [targetId, serviceName, portNum, protocol, serviceVersion]
        );

        let serviceId = serviceResult.insertId;
        if (serviceResult.affectedRows === 2) {
          const existing = await query(
            "SELECT service_id FROM services WHERE target_id = ? AND port = ? AND protocol = ?",
            [targetId, portNum, protocol]
          );
          serviceId = existing[0]?.service_id;
        }

        if (serviceId) {
          await execute(
            "INSERT IGNORE INTO service_contributors (contributor_id, service_id) VALUES (?, ?)",
            [contributorId, serviceId]
          );
        }
      }
    }
  }
}

export async function cancelScanExecution(scanId) {
  const scanInfo = runningScans.get(scanId);
  if (!scanInfo) {
    return false;
  }

  const { process: child, timeoutHandle } = scanInfo;
  clearTimeout(timeoutHandle);

  if (child && !child.killed) {
    child.kill("SIGTERM");

    await new Promise(resolve => setTimeout(resolve, 2000));

    if (!child.killed) {
      child.kill("SIGKILL");
    }
  }

  runningScans.delete(scanId);

  await execute(
    `UPDATE scans 
     SET status = 'CANCELLED', 
         error_message = 'Cancelled by user', 
         runner_pid = NULL,
         finished_at = NOW(),
         updated_at = NOW()
     WHERE scan_id = ?`,
    [scanId]
  );

  return true;
}

export async function recoverOrphanedScans() {
  const orphaned = await query(
    "SELECT scan_id FROM scans WHERE status = 'RUNNING' AND runner_pid IS NOT NULL"
  );

  for (const scan of orphaned) {
    await execute(
      `UPDATE scans 
       SET status = 'FAILED', 
           error_message = 'App restarted during scan', 
           runner_pid = NULL,
           updated_at = NOW()
       WHERE scan_id = ?`,
      [scan.scan_id]
    );
  }

  return orphaned.length;
}

export async function cancelAllRunningScans() {
  const running = await query("SELECT scan_id, runner_pid FROM scans WHERE status = 'RUNNING'");
  let cancelled = 0;

  for (const scan of running) {
    const scanInfo = runningScans.get(scan.scan_id);
    if (scanInfo) {
      const { process: child, timeoutHandle } = scanInfo;
      clearTimeout(timeoutHandle);
      if (child && !child.killed) {
        child.kill("SIGKILL");
      }
      runningScans.delete(scan.scan_id);
    } else if (scan.runner_pid) {
      try {
        process.kill(scan.runner_pid, "SIGKILL");
      } catch {}
    }

    await execute(
      `UPDATE scans 
       SET status = 'CANCELLED', 
           error_message = 'App shutdown', 
           runner_pid = NULL,
           finished_at = NOW(),
           updated_at = NOW()
       WHERE scan_id = ?`,
      [scan.scan_id]
    );
    cancelled++;
  }

  return cancelled;
}
