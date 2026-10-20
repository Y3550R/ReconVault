export function validateIPv4(ip) {
  if (typeof ip !== "string") return false;
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    const n = parseInt(p, 10);
    return n >= 0 && n <= 255 && p === String(n);
  });
}

export function validateIPv6(ip) {
  if (typeof ip !== "string") return false;
  if (ip === "::1" || ip === "::") return true;
  
  const parts = ip.split(":");
  if (parts.length < 3 || parts.length > 8) return false;
  
  let hasDoubleColon = false;
  for (const part of parts) {
    if (part === "") {
      if (hasDoubleColon) return false;
      hasDoubleColon = true;
      continue;
    }
    if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return false;
  }
  
  if (hasDoubleColon) return true;
  return parts.length === 8;
}

export function validateIPv6CIDR(cidr) {
  if (typeof cidr !== "string") return false;
  const match = cidr.match(/^(.+)\/(\d{1,3})$/);
  if (!match) return false;
  const ip = match[1];
  const prefix = parseInt(match[2], 10);
  if (prefix < 0 || prefix > 128) return false;
  return validateIPv6(ip);
}

export function validateIPv4CIDR(cidr) {
  if (typeof cidr !== "string") return false;
  const match = cidr.match(/^((\d{1,3}\.){3}\d{1,3})\/(\d{1,2})$/);
  if (!match) return false;
  const ip = match[1];
  const prefix = parseInt(match[3], 10);
  if (prefix < 0 || prefix > 32) return false;
  return validateIPv4(ip);
}

export function validateIPv4OrCIDR(addr) {
  return validateIPv4(addr) || validateIPv4CIDR(addr);
}

export function validateIPv6OrCIDR(addr) {
  return validateIPv6(addr) || validateIPv6CIDR(addr);
}

export function validateIP(ip) {
  return validateIPv4(ip) || validateIPv6(ip);
}

export function validateIPType(ip) {
  if (validateIPv4(ip) || validateIPv4CIDR(ip)) return "IPV4";
  if (validateIPv6(ip) || validateIPv6CIDR(ip)) return "IPV6";
  return null;
}

export function validatePort(port) {
  if (typeof port !== "number") return false;
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

export function validateCIDR(cidr) {
  if (typeof cidr !== "string") return false;
  const match = cidr.match(/^((\d{1,3}\.){3}\d{1,3})\/(\d{1,2})$/);
  if (!match) return false;
  const ip = match[1];
  const prefix = parseInt(match[3], 10);
  if (prefix < 0 || prefix > 32) return false;
  return validateIPv4(ip);
}

export function validateCIDRArray(cidrs) {
  return Array.isArray(cidrs) && cidrs.length > 0 && cidrs.every(validateCIDR);
}

export const ENGAGEMENT_STATUSES = ["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"];
export const SCAN_STATUSES = ["READY", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"];
export const SCAN_TYPES = ["HOST", "PORT"];
export const TARGET_STATUSES = ["ACTIVE", "INACTIVE"];
export const SERVICE_STATES = ["UNKNOWN", "OPEN", "CLOSED", "FILTERED"];
export const FINDING_SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
export const FINDING_STATUSES = ["OPEN", "IN PROGRESS", "RESOLVED", "ACCEPTED"];
export const USER_STATUSES = ["ACTIVE", "INACTIVE"];
export const CONTRIBUTOR_TYPES = ["SCAN", "PENTESTER"];
export const PROTOCOLS = ["TCP", "UDP", "SCTP", "ICMP"];

export function validateEnum(value, allowed) {
  return allowed.includes(value);
}

export function sanitizeString(str, maxLength = 1000) {
  if (typeof str !== "string") return "";
  return str.trim().slice(0, maxLength);
}

export function parseSort(sort, allowedFields = []) {
  if (!sort) return null;
  const [field, direction] = sort.split(":");
  if (allowedFields.length && !allowedFields.includes(field)) return null;
  return { field, direction: direction?.toUpperCase() === "DESC" ? "DESC" : "ASC" };
}

export function parseFilter(filter) {
  if (!filter || typeof filter !== "object") return {};
  const result = {};
  for (const [key, value] of Object.entries(filter)) {
    if (value !== undefined && value !== null && value !== "") {
      result[key] = value;
    }
  }
  return result;
}