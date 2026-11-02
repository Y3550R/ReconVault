import { getCurrentUser, hasRole } from "../auth.js";
import { api } from "../api.js";

const content = document.getElementById("scans-content");
const alertBox = document.getElementById("scans-alert");
const refreshButton = document.getElementById("refresh-scans-button");
const createButton = document.getElementById("create-scan-button");
const scansCount = document.getElementById("scans-count");
const streamState = document.getElementById("scan-stream-state");

const outputPanel = document.getElementById("scan-output-panel");
const outputTitle = document.getElementById("scan-output-title");
const outputMeta = document.getElementById("scan-output-meta");
const outputStatus = document.getElementById("scan-output-status");
const outputElement = document.getElementById("scan-output");
const closeOutputButton = document.getElementById("close-scan-output");

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

let socket = null;
let socketReconnectTimer = null;
let socketReconnectAttempt = 0;
let pageUnloading = false;
let refreshTimer = null;
let pollTimer = null;
let metaTimer = null;

let selectedScanId = null;
let dismissedScanId = null;
let outputLiveBuffer = "";
let outputSnapshotStatus = null;
let outputLoadToken = 0;

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

function formatDuration(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const parts = [];

    if (hours) parts.push(`${hours}h`);
    if (minutes || hours) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);

    return parts.join(" ");
}

function statusClass(status) {
    const normalized = String(status ?? "UNKNOWN").toUpperCase();

    return normalized === "READY" ? "ready" :
        normalized === "RUNNING" ? "running" :
            normalized === "COMPLETED" ? "completed" :
                normalized === "FAILED" ? "failed" :
                    normalized === "CANCELLED" ? "cancelled" : "";
}

function renderStatus(status) {
    const normalized = String(status ?? "UNKNOWN").toUpperCase();

    return `<span class="scan-status ${statusClass(normalized)}">${escapeHtml(normalized)}</span>`;
}

function scanTargetText(scan) {
    if (scan.scan_type === "HOST" && scan.hosts?.length) {
        return scan.hosts.map(h => `${h.ip_address_or_cidr} (${h.ip_type})`).join(", ");
    }

    if (scan.scan_type === "PORT" && scan.target_ip_address) {
        const ports = scan.ports?.map(p => `${p.port_start}-${p.port_end}/${p.protocol}`).join(", ") || "—";
        return `${scan.target_ip_address} (${scan.target_ip_type}) — Ports: ${ports}`;
    }

    return "—";
}

function getScan(scanId) {
    return scans.find(
        (scan) => String(scan.scan_id ?? scan.id) === String(scanId)
    );
}

function setStreamState(state, label) {
    streamState.dataset.state = state;
    streamState.textContent = label;
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
        const targetDisplay = scanTargetText(scan);

        const outputAction = validId && scan.status !== "READY"
            ? `
            <button type="button"
            class="btn btn-sm btn-outline-secondary rv-button"
            data-action="output"
            data-scan-id="${escapeHtml(scanId)}">${scan.status === "RUNNING" ? "Live output" : "View output"}</button>
            `
            : "";

        const managementActions = validId && isPentester
            ? `
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
        `
            : "";

        const actions = outputAction || managementActions
            ? `<div class="d-flex flex-wrap gap-2">${outputAction}${managementActions}</div>`
            : `<span class="text-muted">—</span>`;

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

async function loadScans({ silent = false } = {}) {
    if (loading || !engagementId) return;

    loading = true;
    scansCount.textContent = "Loading scans...";
    refreshButton.disabled = true;
    content.setAttribute("aria-busy", "true");

    if (!silent) hideAlert();

    try {
        const result = await api.get(
            `/engagements/${encodeURIComponent(engagementId)}/scans`
        );

        scans = Array.isArray(result?.scans) ? result.scans : [];
        renderScans();
        syncOutputSelection();
    } catch (error) {
        scansCount.textContent = "Unable to load scans";

        if (!silent) {
            showAlert(error.message || "Unable to load scans.");
        }
    } finally {
        loading = false;
        refreshButton.disabled = false;
        content.setAttribute("aria-busy", "false");
    }
}

function renderOutputMeta(status, errorMessage, scan) {
    const normalized = String(status ?? "UNKNOWN").toUpperCase();

    outputStatus.className = `scan-status ${statusClass(normalized)}`;
    outputStatus.textContent = normalized;

    if (!scan) {
        outputTitle.textContent = "Scan output";
        outputMeta.textContent = "Select a scan to view its output.";
        return;
    }

    const scanId = scan.scan_id ?? scan.id;
    const target = scanTargetText(scan);
    const parts = [];

    if (target !== "—") parts.push(target);
    if (scan.started_at) {
        parts.push(`Started ${formatDate(scan.started_at)}`);
    }

    if (normalized === "RUNNING" && scan.started_at) {
        const startedAt = new Date(scan.started_at).getTime();

        if (!Number.isNaN(startedAt)) {
            parts.push(`Elapsed ${formatDuration(Date.now() - startedAt)}`);
        }
    }

    if (scan.finished_at) {
        parts.push(`Finished ${formatDate(scan.finished_at)}`);
    }

    if (scan.runner_username) {
        parts.push(`Runner ${scan.runner_username}`);
    }

    if (errorMessage) {
        parts.push(errorMessage);
    }

    outputTitle.textContent = `Scan #${scanId} output`;
    outputMeta.textContent = parts.join(" · ") || "No additional details.";
}

function setOutputContent(text) {
    outputElement.textContent = text || "No output yet.";
    outputElement.scrollTop = outputElement.scrollHeight;
}

function scrollOutputToBottom() {
    outputElement.scrollTop = outputElement.scrollHeight;
}

function appendScanOutput(chunk) {
    if (!chunk) return;

    const atBottom =
        outputElement.scrollHeight - outputElement.scrollTop - outputElement.clientHeight < 48;
    const existing = outputElement.textContent;
    const isPlaceholder =
        existing === "No output yet." ||
        existing === "Loading output…" ||
        existing === "This scan has not run yet.";
    const current = isPlaceholder ? "" : existing;

    let next = current + chunk;

    // Keep the DOM bounded during very long or very verbose scans.
    if (next.length > 2000000) {
        next = next.slice(-1500000);
    }

    outputElement.textContent = next;

    if (atBottom) scrollOutputToBottom();
}

function mergeSnapshotAndLive(snapshot, live) {
    if (!live) return snapshot;
    if (snapshot.endsWith(live)) return snapshot;

    const maxOverlap = Math.min(snapshot.length, live.length);

    for (let length = maxOverlap; length > 0; length -= 1) {
        if (snapshot.endsWith(live.slice(0, length))) {
            return snapshot + live.slice(length);
        }
    }

    return snapshot + live;
}

async function loadScanOutput(scanId, { mergeLive = false } = {}) {
    if (!engagementId || !scanId) return;

    const token = ++outputLoadToken;
    const scan = getScan(scanId);

    try {
        const result = await api.get(
            `/engagements/${encodeURIComponent(engagementId)}/scans/${encodeURIComponent(scanId)}/output`
        );

        if (
            token !== outputLoadToken ||
            String(selectedScanId) !== String(scanId)
        ) {
            return;
        }

        const snapshot = result?.output ?? "";
        const live = mergeLive ? outputLiveBuffer : "";
        const status = result?.status ?? scan?.status ?? "UNKNOWN";

        outputSnapshotStatus = status;
        outputLiveBuffer = "";
        setOutputContent(mergeSnapshotAndLive(snapshot, live));
        renderOutputMeta(status, result?.error_message ?? scan?.error_message, getScan(scanId) ?? scan);
    } catch (error) {
        if (token !== outputLoadToken) return;

        outputElement.textContent = `Unable to load scan output: ${error.message}`;
    }
}

function sendSocketMessage(message) {
    if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
    }
}

function selectOutputScan(scanId, { scroll = true } = {}) {
    const scan = getScan(scanId);

    if (!scan) return;

    selectedScanId = String(scanId);
    dismissedScanId = null;
    outputLiveBuffer = "";
    outputSnapshotStatus = null;
    outputPanel.hidden = false;
    sendSocketMessage({ type: "subscribe", scanId: Number(scanId) });
    renderOutputMeta(scan.status, scan.error_message, scan);
    setOutputContent(scan.status === "READY" ? "This scan has not run yet." : "Loading output…");

    if (scroll) {
        outputPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    void loadScanOutput(scanId, { mergeLive: true });
}

function closeOutputPanel({ dismiss = true } = {}) {
    if (dismiss) {
        dismissedScanId = selectedScanId;
    }

    selectedScanId = null;
    outputLiveBuffer = "";
    outputSnapshotStatus = null;
    outputLoadToken++;
    outputPanel.hidden = true;
    outputElement.textContent = "No output yet.";
    sendSocketMessage({ type: "unsubscribe" });
}

function syncOutputSelection() {
    if (selectedScanId != null) {
        const selected = getScan(selectedScanId);

        if (!selected) {
            closeOutputPanel({ dismiss: false });
            return;
        }

        renderOutputMeta(selected.status, selected.error_message, selected);
        return;
    }

    const running = scans.find((scan) => {
        if (scan.status !== "RUNNING") return false;

        const id = String(scan.scan_id ?? scan.id);

        return dismissedScanId == null || id !== String(dismissedScanId);
    });

    if (!running) return;

    const runningId = String(running.scan_id ?? running.id);

    selectOutputScan(runningId, { scroll: false });
}

async function refreshScansFromEvent() {
    await loadScans({ silent: true });

    if (selectedScanId == null) return;

    const selected = getScan(selectedScanId);

    if (
        selected &&
        selected.status !== "RUNNING" &&
        outputSnapshotStatus !== selected.status
    ) {
        await loadScanOutput(selectedScanId);
    }
}

function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
        void refreshScansFromEvent();
    }, 250);
}

function handleSocketMessage(event) {
    let message;

    try {
        message = JSON.parse(event.data);
    } catch {
        return;
    }

    if (message?.type === "connected") {
        setStreamState("connected", "Live updates: live");
        scheduleRefresh();
        return;
    }

    if (message?.type === "scan.output") {
        if (String(message.scanId) !== String(selectedScanId)) return;

        const chunk = String(message.chunk ?? "");

        outputLiveBuffer += chunk;
        appendScanOutput(chunk);
        return;
    }

    if (message?.type === "scan.status" || message?.type === "scans.changed") {
        scheduleRefresh();
    }
}

function scheduleSocketReconnect() {
    if (pageUnloading) return;

    clearTimeout(socketReconnectTimer);

    const delay = Math.min(15000, 1000 * (2 ** socketReconnectAttempt));
    socketReconnectAttempt += 1;

    setStreamState("reconnecting", "Live updates: reconnecting…");
    socketReconnectTimer = setTimeout(connectWebSocket, delay);
}

function connectWebSocket() {
    if (pageUnloading || !engagementId) return;

    if (
        socket &&
        (socket.readyState === WebSocket.OPEN ||
            socket.readyState === WebSocket.CONNECTING)
    ) {
        return;
    }

    setStreamState("connecting", "Live updates: connecting…");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws/scans?engagementId=${encodeURIComponent(engagementId)}`;

    let ws;

    try {
        ws = new WebSocket(url);
    } catch {
        socket = null;
        scheduleSocketReconnect();
        return;
    }

    socket = ws;

    ws.addEventListener("open", () => {
        if (socket !== ws) return;

        socketReconnectAttempt = 0;
        setStreamState("connected", "Live updates: live");
        scheduleRefresh();

        if (selectedScanId != null) {
            sendSocketMessage({ type: "subscribe", scanId: Number(selectedScanId) });
            void loadScanOutput(selectedScanId);
        }
    });

    ws.addEventListener("message", handleSocketMessage);

    ws.addEventListener("close", () => {
        if (socket === ws) {
            socket = null;
        }

        scheduleSocketReconnect();
    });

    ws.addEventListener("error", () => {
        if (socket === ws) {
            ws.close();
        }
    });
}

function startPollingFallback() {
    clearInterval(pollTimer);

    pollTimer = setInterval(() => {
        const socketOpen = socket?.readyState === WebSocket.OPEN;

        if (!socketOpen) {
            void refreshScansFromEvent();
        }
    }, 10000);
}

function startElapsedTimer() {
    clearInterval(metaTimer);

    metaTimer = setInterval(() => {
        if (selectedScanId == null) return;

        const scan = getScan(selectedScanId);

        if (scan?.status === "RUNNING") {
            renderOutputMeta(scan.status, scan.error_message, scan);
        }
    }, 1000);
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
        selectOutputScan(scanId);
        showAlert("Scan started successfully.", "success");
    } catch (error) {
        await loadScans({ silent: true });
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
    if (!button) return;

    const { action, scanId } = button.dataset;

    if (action === "output") {
        selectOutputScan(scanId);
        return;
    }

    if (!isPentester) return;

    if (action === "edit") openEditForm(scanId);
    else if (action === "start") startScan(scanId);
    else if (action === "cancel") cancelScan(scanId);
});

closeOutputButton.addEventListener("click", () => closeOutputPanel());

scanTypeSelect.addEventListener("change", toggleScanFields);
addHostButton.addEventListener("click", addHostEntry);
addPortButton.addEventListener("click", addPortEntry);

createButton.addEventListener("click", openCreateForm);
cancelButton.addEventListener("click", closeScanForm);
cancelButtonBottom.addEventListener("click", closeScanForm);
refreshButton.addEventListener("click", () => {
    void refreshScansFromEvent();
});
scanForm.addEventListener("submit", saveScan);

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        void refreshScansFromEvent();
    }
});

window.addEventListener("beforeunload", () => {
    pageUnloading = true;
    clearTimeout(refreshTimer);
    clearTimeout(socketReconnectTimer);
    clearInterval(pollTimer);
    clearInterval(metaTimer);
    socket?.close();
});

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

        connectWebSocket();
        startPollingFallback();
        startElapsedTimer();
    } catch (error) {
        showAlert(error.message || "Unable to initialize the scans page.");
    }
}

initialize();
