import { getCurrentUser, hasRole } from "../auth.js";
import { api } from "../api.js";

const content = document.getElementById("scans-content");
const alertBox = document.getElementById("scans-alert");
const refreshButton = document.getElementById("refresh-scans-button");
const createButton = document.getElementById("create-scan-button");
const scansCount = document.getElementById("scans-count");

const formPanel = document.getElementById("scan-form-panel");
const formTitle = document.getElementById("scan-form-title");
const cancelButton = document.getElementById("cancel-scan-form");
const cancelButtonBottom = document.getElementById("cancel-scan-form-bottom");

const scanForm = document.getElementById("scan-form");
const saveButton = document.getElementById("save-scan-button");
const formAlert = document.getElementById("scan-form-alert");

const scanTypeSelect = document.getElementById("scan-type");
const hostScanFields = document.getElementById("host-scan-fields");
const portScanFields = document.getElementById("port-scan-fields");

const hostEntries = document.getElementById("host-entries");
const addHostButton = document.getElementById("add-host-button");

const portEntries = document.getElementById("port-entries");
const addPortButton = document.getElementById("add-port-button");

const engagementMatch = window.location.pathname.match(
    /\/engagements\/([1-9]\d*)\/scans\/?$/
);

const engagementId = engagementMatch?.[1];

let currentUser = null;
let isPentester = false;
let scans = [];
let editingScanId = null;
let loading = false;
let saving = false;
let nextHostIndex = 0;
let nextPortIndex = 0;

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    })[char]);
}

function showAlert(message, type = "danger") {
    alertBox.className = `alert alert-${type}`;
    alertBox.textContent = message;
}

function hideAlert() {
    alertBox.className = "alert d-none";
    alertBox.textContent = "";
}

function showFormAlert(message, type = "danger") {
    formAlert.className = `alert alert-${type}`;
    formAlert.textContent = message;
}

function hideFormAlert() {
    formAlert.className = "alert d-none";
    formAlert.textContent = "";
}

function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function renderStatus(status) {
    const normalized = String(status ?? "UNKNOWN").toUpperCase();
    const statusClass =
        normalized === "READY" ? "ready" :
            normalized === "RUNNING" ? "running" :
                normalized === "COMPLETED" ? "completed" :
                    normalized === "FAILED" ? "failed" :
                        normalized === "CANCELLED" ? "cancelled" : "";

    return `<span class="scan-status ${statusClass}">${escapeHtml(normalized)}</span>`;
}

function renderScanType(type) {
    const normalized = String(type ?? "").toUpperCase();
    return `<span class="scan-type-badge ${normalized.toLowerCase()}">${escapeHtml(normalized)}</span>`;
}

function renderEmptyState() {
    content.innerHTML = `
    <div class="scans-empty">
    <h2>No scans found</h2>
    <p>No scans have been created for this engagement yet.</p>
    </div>
    `;
}

function renderScans() {
    scansCount.textContent =
        `${scans.length} scan${scans.length === 1 ? "" : "s"}`;

    if (!scans.length) {
        renderEmptyState();
        return;
    }

    content.innerHTML = `
    <div class="scans-table-wrap">
    <table class="scans-table">
    <thead>
    <tr>
    <th scope="col">Type</th>
    <th scope="col">Target</th>
    <th scope="col">Status</th>
    <th scope="col">Created</th>
    <th scope="col">Started</th>
    <th scope="col">Finished</th>
    <th scope="col">Runner</th>
    <th scope="col">Actions</th>
    </tr>
    </thead>
    <tbody>
    ${scans.map((scan) => {
        const scanId = scan.scan_id ?? scan.id;
        const validId = /^[1-9]\d*$/.test(String(scanId ?? ""));

        let targetDisplay = "—";
        if (scan.scan_type === "HOST" && scan.hosts?.length) {
            targetDisplay = scan.hosts.map(h => `${h.ip_address_or_cidr} (${h.ip_type})`).join(", ");
        } else if (scan.scan_type === "PORT" && scan.target_ip_address) {
            const ports = scan.ports?.map(p => `${p.port_start}-${p.port_end}/${p.protocol}`).join(", ") || "—";
            targetDisplay = `${scan.target_ip_address} (${scan.target_ip_type}) — Ports: ${ports}`;
        }

        const actions = validId && isPentester
            ? `
        <div class="d-flex flex-wrap gap-2">
        ${scan.status === "READY" ? `
            <button type="button"
            class="btn btn-sm btn-outline-secondary rv-button"
            data-action="edit"
            data-scan-id="${escapeHtml(scanId)}">Edit</button>
            <button type="button"
            class="btn btn-sm btn-primary"
            data-action="start"
            data-scan-id="${escapeHtml(scanId)}">Start</button>
        ` : ""}
        ${scan.status === "RUNNING" ? `
            <button type="button"
            class="btn btn-sm btn-outline-danger"
            data-action="cancel"
            data-scan-id="${escapeHtml(scanId)}">Cancel</button>
        ` : ""}
        </div>
        `
            : `<span class="text-muted">Unavailable</span>`;

        return `
            <tr>
            <td>${renderScanType(scan.scan_type)}</td>
            <td class="scan-target">${escapeHtml(targetDisplay)}</td>
            <td>${renderStatus(scan.status)}</td>
            <td>${escapeHtml(formatDate(scan.created_at))}</td>
            <td>${escapeHtml(formatDate(scan.started_at))}</td>
            <td>${escapeHtml(formatDate(scan.finished_at))}</td>
            <td>${escapeHtml(scan.runner_username || "—")}</td>
            <td>${actions}</td>
            </tr>
            `;
    }).join("")}
    </tbody>
    </table>
    </div>
    `;
}

async function loadScans() {
    if (loading || !engagementId) return;

    loading = true;
    scansCount.textContent = "Loading scans...";
    refreshButton.disabled = true;
    content.setAttribute("aria-busy", "true");
    hideAlert();

    try {
        const result = await api.get(
            `/engagements/${encodeURIComponent(engagementId)}/scans`
        );

        scans = Array.isArray(result?.scans) ? result.scans : [];
        renderScans();
    } catch (error) {
        scansCount.textContent = "Unable to load scans";
        showAlert(error.message || "Unable to load scans.");
    } finally {
        loading = false;
        refreshButton.disabled = false;
        content.setAttribute("aria-busy", "false");
    }
}

function resetForm() {
    scanForm.reset();
    scanTypeSelect.value = "";
    hostScanFields.classList.add("d-none");
    portScanFields.classList.add("d-none");
    hostEntries.innerHTML = "";
    portEntries.innerHTML = "";
    nextHostIndex = 0;
    nextPortIndex = 0;
    addHostEntry();
    addPortEntry();
    toggleScanFields();
    hideFormAlert();
}

function setSectionEnabled(section, enabled) {
    section.querySelectorAll("input, select, textarea, button").forEach((field) => {
        field.disabled = !enabled;
    });
}

function toggleScanFields() {
    const type = scanTypeSelect.value;
    const isHost = type === "HOST";
    const isPort = type === "PORT";

    hostScanFields.classList.toggle("d-none", !isHost);
    portScanFields.classList.toggle("d-none", !isPort);

    setSectionEnabled(hostScanFields, isHost);
    setSectionEnabled(portScanFields, isPort);
}

function createHostEntry() {
    const index = nextHostIndex++;
    const div = document.createElement("div");
    div.className = "col-12 host-entry";
    div.dataset.index = index;
    div.innerHTML = `
        <div class="input-group mb-2">
            <select class="form-select host-ip-type" name="hosts[${index}][ip_type]" required>
                <option value="IPV4">IPv4</option>
                <option value="IPV6">IPv6</option>
            </select>
            <input type="text" class="form-control host-ip-address"
                name="hosts[${index}][ip_address_or_cidr]" placeholder="192.168.1.0/24 or 10.0.0.1" required>
            <button type="button" class="btn btn-outline-danger remove-host" title="Remove">×</button>
        </div>
    `;
    hostEntries.appendChild(div);

    const removeBtn = div.querySelector(".remove-host");
    removeBtn.addEventListener("click", () => {
        const entries = hostEntries.querySelectorAll(".host-entry");
        if (entries.length > 1) {
            div.remove();
        } else {
            div.querySelector(".host-ip-address").value = "";
            div.querySelector(".host-ip-type").value = "IPV4";
        }
    });
}

function addHostEntry() {
    createHostEntry();
}

function createPortEntry() {
    const index = nextPortIndex++;
    const div = document.createElement("div");
    div.className = "col-12 port-entry";
    div.dataset.index = index;
    div.innerHTML = `
        <div class="row g-2 mb-2">
            <div class="col-md-3">
                <label for="port-start-${index}" class="form-label visually-hidden">Start port</label>
                <input id="port-start-${index}" name="ports[${index}][port_start]" class="form-control" type="number"
                    min="1" max="65535" placeholder="Start" required>
            </div>
            <div class="col-md-3">
                <label for="port-end-${index}" class="form-label visually-hidden">End port</label>
                <input id="port-end-${index}" name="ports[${index}][port_end]" class="form-control" type="number"
                    min="1" max="65535" placeholder="End" required>
            </div>
            <div class="col-md-3">
                <label for="port-protocol-${index}" class="form-label">Protocol</label>
                <select id="port-protocol-${index}" name="ports[${index}][protocol]" class="form-select">
                    <option value="TCP" selected>TCP</option>
                    <option value="UDP">UDP</option>
                    <option value="SCTP">SCTP</option>
                    <option value="ICMP">ICMP</option>
                </select>
            </div>
            <div class="col-md-3 d-flex align-items-end">
                <button type="button" class="btn btn-outline-danger remove-port w-100" title="Remove">×</button>
            </div>
        </div>
    `;
    portEntries.appendChild(div);

    const removeBtn = div.querySelector(".remove-port");
    removeBtn.addEventListener("click", () => {
        const entries = portEntries.querySelectorAll(".port-entry");
        if (entries.length > 1) {
            div.remove();
        } else {
            div.querySelector("input[name$='[port_start]']").value = "";
            div.querySelector("input[name$='[port_end]']").value = "";
            div.querySelector("select[name$='[protocol]']").value = "TCP";
        }
    });
}

function addPortEntry() {
    createPortEntry();
}

function openCreateForm() {
    if (!isPentester) return;

    editingScanId = null;
    resetForm();

    formTitle.textContent = "Create scan";
    saveButton.textContent = "Create scan";
    formPanel.hidden = false;

    formPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    scanTypeSelect.focus();
}

function openEditForm(scanId) {
    if (!isPentester) return;

    const scan = scans.find(
        (item) => String(item.scan_id ?? item.id) === String(scanId)
    );

    if (!scan) {
        showAlert("The selected scan could not be found.");
        return;
    }

    editingScanId = String(scanId);
    resetForm();

    scanTypeSelect.value = scan.scan_type;
    toggleScanFields();

    document.getElementById("scan-description").value = scan.description ?? "";

    if (scan.scan_type === "HOST" && scan.hosts?.length) {
        hostEntries.innerHTML = "";
        nextHostIndex = 0;
        scan.hosts.forEach((h, i) => {
            createHostEntry();
            const entry = hostEntries.querySelector(`.host-entry[data-index="${i}"]`);
            if (entry) {
                entry.querySelector(".host-ip-type").value = h.ip_type;
                entry.querySelector(".host-ip-address").value = h.ip_address_or_cidr;
            }
        });
    } else if (scan.scan_type === "PORT") {
        document.getElementById("port-target-ip-type").value = scan.target_ip_type ?? "";
        document.getElementById("port-target-ip-address").value = scan.target_ip_address ?? "";

        if (scan.ports?.length) {
            portEntries.innerHTML = "";
            nextPortIndex = 0;
            scan.ports.forEach((p, i) => {
                createPortEntry();
                const entry = portEntries.querySelector(`.port-entry[data-index="${i}"]`);
                if (entry) {
                    entry.querySelector("input[name$='[port_start]']").value = p.port_start;
                    entry.querySelector("input[name$='[port_end]']").value = p.port_end;
                    entry.querySelector("select[name$='[protocol]']").value = p.protocol;
                }
            });
        }
    }

    formTitle.textContent = "Edit scan";
    saveButton.textContent = "Save changes";
    formPanel.hidden = false;

    formPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    scanTypeSelect.focus();
}

function closeScanForm() {
    formPanel.hidden = true;
    editingScanId = null;
    resetForm();
}

function getFormPayload() {
    const type = scanTypeSelect.value;
    const payload = {
        scan_type: type,
        description: document.getElementById("scan-description").value.trim(),
    };

    if (type === "HOST") {
        const hosts = [];
        hostEntries.querySelectorAll(".host-entry").forEach((entry) => {
            const ipType = entry.querySelector(".host-ip-type").value;
            const ipAddress = entry.querySelector(".host-ip-address").value.trim();
            if (ipAddress) {
                hosts.push({ ip_type: ipType, ip_address_or_cidr: ipAddress });
            }
        });
        payload.hosts = hosts;
    } else if (type === "PORT") {
        payload.target_ip_type = document.getElementById("port-target-ip-type").value;
        payload.target_ip_address = document.getElementById("port-target-ip-address").value.trim();

        const ports = [];
        portEntries.querySelectorAll(".port-entry").forEach((entry) => {
            const portStart = parseInt(entry.querySelector("input[name$='[port_start]']").value, 10);
            const portEnd = parseInt(entry.querySelector("input[name$='[port_end]']").value, 10);
            const protocol = entry.querySelector("select[name$='[protocol]']").value;
            if (!isNaN(portStart) && !isNaN(portEnd)) {
                ports.push({ port_start: portStart, port_end: portEnd, protocol });
            }
        });
        payload.ports = ports;
    }

    return payload;
}

function validatePortRanges() {
    const entries = [...portEntries.querySelectorAll(".port-entry")];
    const ranges = [];

    for (const entry of entries) {
        const startInput = entry.querySelector('input[name$="[port_start]"]');
        const endInput = entry.querySelector('input[name$="[port_end]"]');

        const startValue = startInput.value.trim();
        const endValue = endInput.value.trim();

        // Ignore a completely empty optional row.
        if (!startValue && !endValue) continue;

        const start = Number(startValue);
        const end = Number(endValue);

        if (
            !startValue ||
            !endValue ||
            !Number.isInteger(start) ||
            !Number.isInteger(end) ||
            start < 1 ||
            end > 65535 ||
            start > end
        ) {
            return false;
        }

        ranges.push({ port_start: start, port_end: end });
    }

    return ranges.length > 0;
}

async function saveScan(event) {
    event.preventDefault();

    if (!isPentester || saving) return;
    if (!scanForm.reportValidity()) return;

    const type = scanTypeSelect.value;
    if (!type) {
        showFormAlert("Please select a scan type.");
        return;
    }

    if (type === "HOST") {
        const hosts = hostEntries.querySelectorAll(".host-entry .host-ip-address");
        let hasValidHost = false;
        hosts.forEach(input => {
            if (input.value.trim()) hasValidHost = true;
        });
        if (!hasValidHost) {
            showFormAlert("At least one host is required for HOST scans.");
            return;
        }
    } else if (type === "PORT") {
        const targetIpType = document.getElementById("port-target-ip-type").value;
        const targetIpAddress = document.getElementById("port-target-ip-address").value.trim();
        let hasValidPort = validatePortRanges();
        if (!targetIpType || !targetIpAddress) {
            showFormAlert("Target IP type and address are required for PORT scans.");
            return;
        }
        if (!hasValidPort) {
            showFormAlert("At least one port range is required for PORT scans.");
            return;
        }
    }

    saving = true;
    saveButton.disabled = true;
    hideFormAlert();

    try {
        const payload = getFormPayload();
        const wasEditing = Boolean(editingScanId);

        if (editingScanId) {
            await api.patch(
                `/engagements/${encodeURIComponent(engagementId)}/scans/${encodeURIComponent(editingScanId)}`,
                payload
            );
        } else {
            await api.post(
                `/engagements/${encodeURIComponent(engagementId)}/scans`,
                payload
            );
        }

        closeScanForm();
        await loadScans();

        showAlert(
            wasEditing ? "Scan updated successfully." : "Scan created successfully.",
            "success"
        );
    } catch (error) {
        showFormAlert(error.message || "Unable to save the scan.");
    } finally {
        saving = false;
        saveButton.disabled = false;
    }
}

async function startScan(scanId) {
    if (!isPentester) return;

    hideAlert();

    try {
        await api.post(
            `/engagements/${encodeURIComponent(engagementId)}/scans/${encodeURIComponent(scanId)}/start`
        );

        await loadScans();
        showAlert("Scan started successfully.", "success");
    } catch (error) {
        showAlert(error.message || "Unable to start the scan.");
    }
}

async function cancelScan(scanId) {
    if (!isPentester) return;

    const confirmed = window.confirm(
        `Cancel scan ${scanId}?`
    );

    if (!confirmed) return;

    hideAlert();

    try {
        await api.post(
            `/engagements/${encodeURIComponent(engagementId)}/scans/${encodeURIComponent(scanId)}/cancel`
        );

        await loadScans();
        showAlert("Scan cancelled successfully.", "success");
    } catch (error) {
        showAlert(error.message || "Unable to cancel the scan.");
    }
}

content.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button || !isPentester) return;

    const { action, scanId } = button.dataset;

    if (action === "edit") openEditForm(scanId);
    else if (action === "start") startScan(scanId);
    else if (action === "cancel") cancelScan(scanId);
});

scanTypeSelect.addEventListener("change", toggleScanFields);
addHostButton.addEventListener("click", addHostEntry);
addPortButton.addEventListener("click", addPortEntry);

createButton.addEventListener("click", openCreateForm);
cancelButton.addEventListener("click", closeScanForm);
cancelButtonBottom.addEventListener("click", closeScanForm);
refreshButton.addEventListener("click", loadScans);
scanForm.addEventListener("submit", saveScan);

async function initialize() {
    if (!engagementId) {
        showAlert("Invalid engagement URL.");
        content.innerHTML = "";
        return;
    }

    try {
        currentUser = await getCurrentUser();

        if (!currentUser) {
            window.location.replace(
                `/login?returnTo=${encodeURIComponent(window.location.pathname)}`
            );
            return;
        }

        isPentester = hasRole(currentUser, "PENTESTER");
        createButton.hidden = !isPentester;

        await loadScans();
    } catch (error) {
        showAlert(error.message || "Unable to initialize the scans page.");
    }
}

initialize();
