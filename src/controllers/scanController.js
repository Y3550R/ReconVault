import { query, execute, transaction } from "../db.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";
import { validateEnum, validatePort, validateIPv4OrCIDR, validateIPv6OrCIDR } from "../utils/validation.js";
import { setCurrentUserId, clearCurrentUserId } from "../db.js";
import { startScanExecution, cancelScanExecution } from "../services/scanExecutor.js";

export const listScans = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const scans = await query("SELECT * FROM scans WHERE engagement_id = ? ORDER BY created_at DESC", [engagementId]);

  if (scans.length > 0) {
    const scanIds = scans.map(s => s.scan_id);
    const placeholders = scanIds.map(() => "?").join(",");
    
    const hosts = await query(
      `SELECT * FROM scan_hosts WHERE scan_id IN (${placeholders}) ORDER BY scan_host_id`,
      scanIds
    );
    const ports = await query(
      `SELECT * FROM scan_ports WHERE scan_id IN (${placeholders}) ORDER BY scan_port_id`,
      scanIds
    );

    const hostsByScan = hosts.reduce((acc, h) => {
      if (!acc[h.scan_id]) acc[h.scan_id] = [];
      acc[h.scan_id].push(h);
      return acc;
    }, {});
    const portsByScan = ports.reduce((acc, p) => {
      if (!acc[p.scan_id]) acc[p.scan_id] = [];
      acc[p.scan_id].push(p);
      return acc;
    }, {});

    scans.forEach(scan => {
      scan.hosts = hostsByScan[scan.scan_id] || [];
      scan.ports = portsByScan[scan.scan_id] || [];
    });
  }

  res.json({ scans });
});

export const getScan = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const scanId = parseInt(req.params.scanId, 10);

  const scan = await query("SELECT * FROM scans WHERE scan_id = ? AND engagement_id = ?", [scanId, engagementId]);
  if (!scan.length) {
    throw new AppError("Scan not found", 404, "NOT_FOUND");
  }

  const hosts = await query("SELECT * FROM scan_hosts WHERE scan_id = ? ORDER BY scan_host_id", [scanId]);
  const ports = await query("SELECT * FROM scan_ports WHERE scan_id = ? ORDER BY scan_port_id", [scanId]);

  res.json({ scan: { ...scan[0], hosts, ports } });
});

export const createScan = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const { scan_type, description, hosts, ports, target_ip_type, target_ip_address } = req.body;

  if (!validateEnum(scan_type, ["HOST", "PORT"])) {
    throw new AppError("scan_type must be HOST or PORT", 400, "VALIDATION_ERROR");
  }

  if (scan_type === "HOST") {
    if (!Array.isArray(hosts) || hosts.length === 0) {
      throw new AppError("HOST scan requires at least one host in hosts array", 400, "VALIDATION_ERROR");
    }
    for (const h of hosts) {
      if (!h.ip_type || !validateEnum(h.ip_type, ["IPV4", "IPV6"])) {
        throw new AppError("Each host must have ip_type (IPV4 or IPV6)", 400, "VALIDATION_ERROR");
      }
      if (!h.ip_address_or_cidr || typeof h.ip_address_or_cidr !== "string") {
        throw new AppError("Each host must have ip_address_or_cidr", 400, "VALIDATION_ERROR");
      }
      if (h.ip_type === "IPV4") {
        if (!validateIPv4OrCIDR(h.ip_address_or_cidr)) {
          throw new AppError(`Invalid IPv4 address/CIDR: ${h.ip_address_or_cidr}`, 400, "VALIDATION_ERROR");
        }
      } else if (h.ip_type === "IPV6") {
        if (!validateIPv6OrCIDR(h.ip_address_or_cidr)) {
          throw new AppError(`Invalid IPv6 address/CIDR: ${h.ip_address_or_cidr}`, 400, "VALIDATION_ERROR");
        }
      }
    }
  }

  if (scan_type === "PORT") {
    if (!target_ip_type || !validateEnum(target_ip_type, ["IPV4", "IPV6"])) {
      throw new AppError("PORT scan requires target_ip_type (IPV4 or IPV6)", 400, "VALIDATION_ERROR");
    }
    if (!target_ip_address || typeof target_ip_address !== "string") {
      throw new AppError("PORT scan requires target_ip_address", 400, "VALIDATION_ERROR");
    }
    if (target_ip_type === "IPV4") {
      if (!validateIPv4OrCIDR(target_ip_address)) {
        throw new AppError(`Invalid IPv4 address/CIDR: ${target_ip_address}`, 400, "VALIDATION_ERROR");
      }
    } else if (target_ip_type === "IPV6") {
      if (!validateIPv6OrCIDR(target_ip_address)) {
        throw new AppError(`Invalid IPv6 address/CIDR: ${target_ip_address}`, 400, "VALIDATION_ERROR");
      }
    }
    if (!Array.isArray(ports) || ports.length === 0) {
      throw new AppError("PORT scan requires at least one port range in ports array", 400, "VALIDATION_ERROR");
    }
    for (const p of ports) {
      if (!validatePort(p.port_start) || !validatePort(p.port_end)) {
        throw new AppError("port_start and port_end must be valid ports (1-65535)", 400, "VALIDATION_ERROR");
      }
      if (p.port_end < p.port_start) {
        throw new AppError("port_end must be >= port_start", 400, "VALIDATION_ERROR");
      }
      if (p.protocol !== undefined && !validateEnum(p.protocol, ["TCP", "UDP", "SCTP", "ICMP"])) {
        throw new AppError("protocol must be TCP, UDP, SCTP, or ICMP", 400, "VALIDATION_ERROR");
      }
    }
  }

  const engagement = await query("SELECT * FROM engagements WHERE engagement_id = ?", [engagementId]);
  if (!engagement.length) {
    throw new AppError("Engagement not found", 404, "NOT_FOUND");
  }

  const result = await execute(
    "INSERT INTO scans (engagement_id, creator_user_id, scan_type, status, description, target_ip_type, target_ip_address) VALUES (?, ?, ?, 'READY', ?, ?, ?)",
    [engagementId, req.user.user_id, scan_type, description || null, target_ip_type || null, target_ip_address || null]
  );

  const scanId = result.insertId;

  if (scan_type === "HOST" && hosts.length > 0) {
    const hostValues = hosts.map(h => [scanId, h.ip_type, h.ip_address_or_cidr]);
    const hostPlaceholders = hostValues.map(() => "(?, ?, ?)").join(", ");
    const hostParams = hostValues.flat();
    await execute(
      `INSERT INTO scan_hosts (scan_id, ip_type, ip_address_or_cidr) VALUES ${hostPlaceholders}`,
      hostParams
    );
  }

  if (scan_type === "PORT" && ports.length > 0) {
    const portValues = ports.map(p => [scanId, p.port_start, p.port_end, p.protocol || "TCP"]);
    const portPlaceholders = portValues.map(() => "(?, ?, ?, ?)").join(", ");
    const portParams = portValues.flat();
    await execute(
      `INSERT INTO scan_ports (scan_id, port_start, port_end, protocol) VALUES ${portPlaceholders}`,
      portParams
    );
  }

  const scan = await query("SELECT * FROM scans WHERE scan_id = ?", [scanId]);
  const scanHosts = await query("SELECT * FROM scan_hosts WHERE scan_id = ? ORDER BY scan_host_id", [scanId]);
  const scanPorts = await query("SELECT * FROM scan_ports WHERE scan_id = ? ORDER BY scan_port_id", [scanId]);

  res.status(201).json({ scan: { ...scan[0], hosts: scanHosts, ports: scanPorts } });
});

export const updateScan = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const scanId = parseInt(req.params.scanId, 10);
  const { scan_type, description, hosts, ports, target_ip_type, target_ip_address } = req.body;

  const scan = await query("SELECT * FROM scans WHERE scan_id = ? AND engagement_id = ?", [scanId, engagementId]);
  if (!scan.length) {
    throw new AppError("Scan not found", 404, "NOT_FOUND");
  }

  if (scan[0].status !== "READY") {
    throw new AppError("Scan can only be edited while in READY status", 400, "VALIDATION_ERROR");
  }

  if (scan_type !== undefined && !validateEnum(scan_type, ["HOST", "PORT"])) {
    throw new AppError("scan_type must be HOST or PORT", 400, "VALIDATION_ERROR");
  }

  const effectiveScanType = scan_type || scan[0].scan_type;

  if (hosts !== undefined) {
    if (effectiveScanType !== "HOST") {
      throw new AppError("hosts can only be set for HOST scan type", 400, "VALIDATION_ERROR");
    }
    if (!Array.isArray(hosts) || hosts.length === 0) {
      throw new AppError("HOST scan requires at least one host in hosts array", 400, "VALIDATION_ERROR");
    }
    for (const h of hosts) {
      if (!h.ip_type || !validateEnum(h.ip_type, ["IPV4", "IPV6"])) {
        throw new AppError("Each host must have ip_type (IPV4 or IPV6)", 400, "VALIDATION_ERROR");
      }
      if (!h.ip_address_or_cidr || typeof h.ip_address_or_cidr !== "string") {
        throw new AppError("Each host must have ip_address_or_cidr", 400, "VALIDATION_ERROR");
      }
      if (h.ip_type === "IPV4") {
        if (!validateIPv4OrCIDR(h.ip_address_or_cidr)) {
          throw new AppError(`Invalid IPv4 address/CIDR: ${h.ip_address_or_cidr}`, 400, "VALIDATION_ERROR");
        }
      } else if (h.ip_type === "IPV6") {
        if (!validateIPv6OrCIDR(h.ip_address_or_cidr)) {
          throw new AppError(`Invalid IPv6 address/CIDR: ${h.ip_address_or_cidr}`, 400, "VALIDATION_ERROR");
        }
      }
    }
  }

  if (ports !== undefined) {
    if (effectiveScanType !== "PORT") {
      throw new AppError("ports can only be set for PORT scan type", 400, "VALIDATION_ERROR");
    }
    if (!Array.isArray(ports) || ports.length === 0) {
      throw new AppError("PORT scan requires at least one port range in ports array", 400, "VALIDATION_ERROR");
    }
    for (const p of ports) {
      if (!validatePort(p.port_start) || !validatePort(p.port_end)) {
        throw new AppError("port_start and port_end must be valid ports (1-65535)", 400, "VALIDATION_ERROR");
      }
      if (p.port_end < p.port_start) {
        throw new AppError("port_end must be >= port_start", 400, "VALIDATION_ERROR");
      }
      if (p.protocol !== undefined && !validateEnum(p.protocol, ["TCP", "UDP", "SCTP", "ICMP"])) {
        throw new AppError("protocol must be TCP, UDP, SCTP, or ICMP", 400, "VALIDATION_ERROR");
      }
    }
  }

  if (target_ip_type !== undefined || target_ip_address !== undefined) {
    if (effectiveScanType !== "PORT") {
      throw new AppError("target_ip_type and target_ip_address can only be set for PORT scan type", 400, "VALIDATION_ERROR");
    }
    if (target_ip_type !== undefined && !validateEnum(target_ip_type, ["IPV4", "IPV6"])) {
      throw new AppError("target_ip_type must be IPV4 or IPV6", 400, "VALIDATION_ERROR");
    }
    if (target_ip_address !== undefined) {
      if (typeof target_ip_address !== "string") {
        throw new AppError("target_ip_address must be a string", 400, "VALIDATION_ERROR");
      }
      const checkIpType = target_ip_type || scan[0].target_ip_type;
      if (checkIpType === "IPV4") {
        if (!validateIPv4OrCIDR(target_ip_address)) {
          throw new AppError(`Invalid IPv4 address/CIDR: ${target_ip_address}`, 400, "VALIDATION_ERROR");
        }
      } else if (checkIpType === "IPV6") {
        if (!validateIPv6OrCIDR(target_ip_address)) {
          throw new AppError(`Invalid IPv6 address/CIDR: ${target_ip_address}`, 400, "VALIDATION_ERROR");
        }
      }
    }
  }

  const updates = [];
  const params = [];

  if (scan_type !== undefined) {
    updates.push("scan_type = ?");
    params.push(scan_type);
  }
  if (description !== undefined) {
    updates.push("description = ?");
    params.push(description);
  }
  if (target_ip_type !== undefined) {
    updates.push("target_ip_type = ?");
    params.push(target_ip_type);
  }
  if (target_ip_address !== undefined) {
    updates.push("target_ip_address = ?");
    params.push(target_ip_address);
  }

  if (updates.length > 0) {
    updates.push("updated_at = NOW()");
    params.push(scanId);
    await execute(`UPDATE scans SET ${updates.join(", ")} WHERE scan_id = ?`, params);
  }

  if (hosts !== undefined) {
    await execute("DELETE FROM scan_hosts WHERE scan_id = ?", [scanId]);
    if (hosts.length > 0) {
      const hostValues = hosts.map(h => [scanId, h.ip_type, h.ip_address_or_cidr]);
      const hostPlaceholders = hostValues.map(() => "(?, ?, ?)").join(", ");
      const hostParams = hostValues.flat();
      await execute(
        `INSERT INTO scan_hosts (scan_id, ip_type, ip_address_or_cidr) VALUES ${hostPlaceholders}`,
        hostParams
      );
    }
  }

  if (ports !== undefined) {
    await execute("DELETE FROM scan_ports WHERE scan_id = ?", [scanId]);
    if (ports.length > 0) {
      const portValues = ports.map(p => [scanId, p.port_start, p.port_end, p.protocol || "TCP"]);
      const portPlaceholders = portValues.map(() => "(?, ?, ?, ?)").join(", ");
      const portParams = portValues.flat();
      await execute(
        `INSERT INTO scan_ports (scan_id, port_start, port_end, protocol) VALUES ${portPlaceholders}`,
        portParams
      );
    }
  }

  const scanUpdated = await query("SELECT * FROM scans WHERE scan_id = ?", [scanId]);
  const scanHosts = await query("SELECT * FROM scan_hosts WHERE scan_id = ? ORDER BY scan_host_id", [scanId]);
  const scanPorts = await query("SELECT * FROM scan_ports WHERE scan_id = ? ORDER BY scan_port_id", [scanId]);

  res.json({ scan: { ...scanUpdated[0], hosts: scanHosts, ports: scanPorts } });
});

export const startScan = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const scanId = parseInt(req.params.scanId, 10);

  const scan = await query("SELECT * FROM scans WHERE scan_id = ? AND engagement_id = ?", [scanId, engagementId]);
  if (!scan.length) {
    throw new AppError("Scan not found", 404, "NOT_FOUND");
  }

  if (scan[0].status !== "READY") {
    throw new AppError("Scan can only be started from READY status", 400, "VALIDATION_ERROR");
  }

  const engagement = await query("SELECT * FROM engagements WHERE engagement_id = ?", [engagementId]);
  if (!engagement.length || engagement[0].status !== "ACTIVE") {
    throw new AppError("Engagement must be ACTIVE to start scans", 400, "VALIDATION_ERROR");
  }

  if (scan[0].scan_type === "HOST") {
    const hosts = await query("SELECT * FROM scan_hosts WHERE scan_id = ?", [scanId]);
    if (!hosts.length) {
      throw new AppError("HOST scan requires at least one host in scan_hosts", 400, "VALIDATION_ERROR");
    }
    scan[0].hosts = hosts;
  } else if (scan[0].scan_type === "PORT") {
    const ports = await query("SELECT * FROM scan_ports WHERE scan_id = ?", [scanId]);
    if (!ports.length) {
      throw new AppError("PORT scan requires at least one port range in scan_ports", 400, "VALIDATION_ERROR");
    }
    if (!scan[0].target_ip_address || !scan[0].target_ip_type) {
      throw new AppError("PORT scan requires target_ip_address and target_ip_type", 400, "VALIDATION_ERROR");
    }
    scan[0].ports = ports;
  }

  await startScanExecution(scanId, req.user.user_id);

  const scanUpdated = await query("SELECT * FROM scans WHERE scan_id = ?", [scanId]);
  res.json({ scan: scanUpdated[0] });
});

export const cancelScan = asyncHandler(async (req, res) => {
  const engagementId = parseInt(req.params.engagementId, 10);
  const scanId = parseInt(req.params.scanId, 10);

  const scan = await query("SELECT * FROM scans WHERE scan_id = ? AND engagement_id = ?", [scanId, engagementId]);
  if (!scan.length) {
    throw new AppError("Scan not found", 404, "NOT_FOUND");
  }

  if (scan[0].status !== "RUNNING") {
    throw new AppError("Scan can only be cancelled from RUNNING status", 400, "VALIDATION_ERROR");
  }

  const cancelled = await cancelScanExecution(scanId);
  if (!cancelled) {
    throw new AppError("Scan is not currently running", 400, "VALIDATION_ERROR");
  }

  const scanUpdated = await query("SELECT * FROM scans WHERE scan_id = ?", [scanId]);
  res.json({ scan: scanUpdated[0] });
});