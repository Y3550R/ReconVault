
import { api } from "../api.js";
import { getCurrentUser, hasRole } from "../auth.js";

const $ = (selector) => document.querySelector(selector);

const engagementId = getEngagementId();

if (!engagementId) {
    showAlert("A valid engagement ID is required.", "danger");
} else {
    initializeDashboard();
}

function getEngagementId() {
    const match = window.location.pathname.match(
        /\/engagements\/([^/]+)\/?$/
    );

    if (!match) return null;

    try {
        return decodeURIComponent(match[1]);
    } catch {
        return null;
    }
}

function engagementPath(suffix = "") {
    return `/engagements/${encodeURIComponent(engagementId)}${suffix}`;
}

function showAlert(message, type = "danger") {
    const alert = $("#dashboard-alert");
    if (!alert) return;

    alert.textContent = message;
    alert.className = `alert alert-${type}`;
}

function hideAlert() {
    const alert = $("#dashboard-alert");
    if (!alert) return;

    alert.textContent = "";
    alert.className = "alert d-none";
}

function setText(selector, value, fallback = "—") {
    const element = $(selector);
    if (element) {
        element.textContent =
            value === null || value === undefined || value === ""
                ? fallback
                : String(value);
    }
}

function setVisible(selector, visible) {
    const element = $(selector);
    if (element) element.classList.toggle("d-none", !visible);
}

function setHref(selector, href) {
    const element = $(selector);
    if (element) element.setAttribute("href", href);
}

function normalizeList(payload, key) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.[key])) return payload[key];
    return [];
}

function normalizeStatus(value) {
    return String(value ?? "UNKNOWN")
        .trim()
        .toUpperCase();
}

function isResolved(finding) {
    return normalizeStatus(finding.status) === "RESOLVED";
}

function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    }).format(date);
}

function formatDateRange(engagement) {
    const start = engagement.start_date;
    const end = engagement.end_date;

    if (!start && !end) return "";

    const startText = start ? formatDate(start) : "Start date not set";
    const endText = end ? formatDate(end) : "No end date";

    return `${startText} – ${endText}`;
}

function getTargetName(target) {
    return (
        target.name ??
        target.hostname ??
        target.host ??
        target.ip_address ??
        target.ip ??
        `Target #${target.id ?? target.target_id ?? "unknown"}`
    );
}

function getTargetIdentifier(target) {
    return (
        target.ip_address ??
        target.ip ??
        target.hostname ??
        target.host ??
        ""
    );
}

function getFindingId(finding) {
    return finding.id ?? finding.finding_id;
}

function getTargetId(target) {
    return target.id ?? target.target_id;
}

function getSeverity(finding) {
    return normalizeStatus(finding.severity);
}

function severityRank(severity) {
    const ranks = {
        CRITICAL: 0,
        HIGH: 1,
        MEDIUM: 2,
        LOW: 3,
        INFO: 4,
    };

    return ranks[normalizeStatus(severity)] ?? 5;
}

function compareFindings(a, b) {
    const severityDifference =
        severityRank(a.severity) - severityRank(b.severity);

    if (severityDifference !== 0) return severityDifference;

    const dateA = new Date(a.discovered_at ?? a.created_at ?? 0).getTime();
    const dateB = new Date(b.discovered_at ?? b.created_at ?? 0).getTime();

    return dateB - dateA;
}

function createCell(text, className = "") {
    const cell = document.createElement("td");
    cell.textContent = text ?? "—";

    if (className) cell.className = className;

    return cell;
}

function createBadge(text, className) {
    const badge = document.createElement("span");
    badge.className = className;
    badge.textContent = text;
    return badge;
}

function createFindingRow(finding) {
    const row = document.createElement("tr");
    const severity = getSeverity(finding);
    const findingId = getFindingId(finding);
    const title = finding.title ?? "Untitled finding";

    const severityCell = document.createElement("td");
    severityCell.append(
        createBadge(
            severity,
            `severity-badge severity-badge--${severity.toLowerCase()}`
        )
    );

    const titleCell = document.createElement("td");
    if (findingId !== undefined && findingId !== null) {
        const link = document.createElement("a");
        link.className = "finding-title-link";
        link.href =
            `${engagementPath("/findings")}/${encodeURIComponent(findingId)}`;
        link.textContent = title;
        titleCell.append(link);
    } else {
        titleCell.textContent = title;
    }

    row.append(
        severityCell,
        titleCell,
        createCell(finding.status ?? "OPEN"),
        createCell(formatDate(finding.discovered_at ?? finding.created_at))
    );

    return row;
}

function renderFindings(findings) {
    const unresolved = findings
        .filter((finding) => !isResolved(finding))
        .sort(compareFindings);

    const openCount = unresolved.length;
    const criticalCount = unresolved.filter(
        (finding) => getSeverity(finding) === "CRITICAL"
    ).length;

    setText("#open-findings-count", openCount);
    setText("#critical-findings-count", criticalCount);

    const tbody = $("#findings-table-body");
    tbody.replaceChildren();

    setVisible("#findings-loading", false);
    setVisible("#findings-error", false);
    setVisible("#findings-empty", unresolved.length === 0);
    setVisible("#findings-table-wrap", unresolved.length > 0);

    unresolved.slice(0, 6).forEach((finding) => {
        tbody.append(createFindingRow(finding));
    });
}

function createTargetItem(target) {
    const item = document.createElement("a");
    item.className = "target-item";

    const targetId = getTargetId(target);
    if (targetId !== undefined && targetId !== null) {
        item.href =
            `${engagementPath("/targets")}/${encodeURIComponent(targetId)}`;
    } else {
        item.href = engagementPath("/targets");
    }

    const details = document.createElement("span");
    details.className = "target-item__details";

    const name = document.createElement("span");
    name.className = "target-item__name";
    name.textContent = getTargetName(target);

    const identifier = document.createElement("span");
    identifier.className = "target-item__identifier";
    identifier.textContent = getTargetIdentifier(target);

    details.append(name);

    if (identifier.textContent) details.append(identifier);

    const arrow = document.createElement("span");
    arrow.className = "target-item__arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "→";

    item.append(details, arrow);

    return item;
}

function renderTargets(targets) {
    setText("#targets-count", targets.length);

    const list = $("#targets-list");
    list.replaceChildren();

    setVisible("#targets-loading", false);
    setVisible("#targets-error", false);
    setVisible("#targets-empty", targets.length === 0);
    setVisible("#targets-list", targets.length > 0);

    targets.slice(0, 6).forEach((target) => {
        list.append(createTargetItem(target));
    });
}

function renderEngagement(engagement) {
    document.title = `${engagement.name} | ReconVault`;

    setText("#engagement-name", engagement.name, "Untitled engagement");
    setText(
        "#engagement-description",
        engagement.description,
        "No engagement description provided."
    );

    const status = String(engagement.status ?? "PLANNED").toUpperCase();
    const statusElement = $("#engagement-status");

    statusElement.textContent = status;
    statusElement.className =
        `status-badge status-badge--${status.toLowerCase()}`;

    setText(
        "#engagement-dates",
        formatDateRange(engagement),
        ""
    );

    // The engagement schema provided does not include an organization field.
    setText("#engagement-organization", "", "");
}

function setDashboardLinks() {
    const targetsUrl = engagementPath("/targets");
    const findingsUrl = engagementPath("/findings");

    setHref("#targets-metric-link", targetsUrl);
    setHref("#services-metric-link", targetsUrl);
    setHref("#findings-metric-link", findingsUrl);
    setHref("#critical-metric-link", findingsUrl);
    setHref("#view-findings-link", findingsUrl);
    setHref("#view-targets-link", targetsUrl);
}

async function loadEngagement() {
    // Assumption to verify against the backend API documentation.
    const response = await api.get(engagementPath());
    const engagement = response?.engagement ?? response;

    if (!engagement || typeof engagement !== "object") {
        throw new Error("The engagement response was invalid.");
    }

    renderEngagement(engagement);
}

async function loadTargets() {
    const response = await api.get(engagementPath("/targets"));
    const targets = normalizeList(response, "targets");

    renderTargets(targets);

    // The list endpoint may not include service counts. Fetch target details
    // to count services using the currently documented target-detail endpoint.
    const serviceCounts = await Promise.allSettled(
        targets.map(async (target) => {
            const targetId = getTargetId(target);
            if (targetId === undefined || targetId === null) {
                throw new Error("Target ID is missing.");
            }

            const detail = await api.get(
                `${engagementPath("/targets")}/${encodeURIComponent(targetId)}`
            );

            return normalizeList(
                detail?.services ? detail : detail?.target ?? detail,
                "services"
            ).length;
        })
    );

    const totalServices = serviceCounts.reduce((total, result) => {
        return result.status === "fulfilled"
            ? total + result.value
            : total;
    }, 0);

    setText("#services-count", totalServices);

    if (serviceCounts.some((result) => result.status === "rejected")) {
        const count = serviceCounts.filter(
            (result) => result.status === "fulfilled"
        ).length;

        $("#services-count").setAttribute(
            "aria-label",
            `At least ${totalServices} services counted; ${targets.length - count} target details could not be loaded`
        );
    }
}

async function loadFindings() {
    const response = await api.get(engagementPath("/findings"));
    const findings = normalizeList(response, "findings");

    renderFindings(findings);
}

async function initializeDashboard() {
    hideAlert();
    setDashboardLinks();

    try {
        const user = await getCurrentUser();

        // Scan UI is intentionally not rendered on this dashboard.
        // This page contains no scan data or scan actions for either role.
        // Scan endpoints must still enforce client access restrictions server-side.
        if (user && hasRole(user, "client")) {
            document.documentElement.dataset.engagementRole = "client";
        } else {
            document.documentElement.dataset.engagementRole = "pentester";
        }

        const results = await Promise.allSettled([
            loadEngagement(),
            loadTargets(),
            loadFindings(),
        ]);

        const failedSections = [];

        if (results[0].status === "rejected") {
            failedSections.push("engagement details");
        }

        if (results[1].status === "rejected") {
            failedSections.push("targets");
            setVisible("#targets-loading", false);
            setVisible("#targets-error", true);
            setText("#targets-count", "—");
            setText("#services-count", "—");
        }

        if (results[2].status === "rejected") {
            failedSections.push("findings");
            setVisible("#findings-loading", false);
            setVisible("#findings-error", true);
            setText("#open-findings-count", "—");
            setText("#critical-findings-count", "—");
        }

        if (failedSections.length > 0) {
            showAlert(
                `Some dashboard data could not be loaded: ${failedSections.join(", ")}. Refresh the page or check your access.`,
                "warning"
            );
        }
    } catch (error) {
        console.error("Failed to initialize engagement dashboard:", error);
        showAlert(
            "The engagement dashboard could not be initialized. Please refresh the page.",
            "danger"
        );
    }
}
