
import { api } from "../api.js";
import { getCurrentUser, hasRole } from "../auth.js";

const routeMatch = window.location.pathname.match(
    /\/engagements\/([1-9]\d*)\/findings\/([1-9]\d*)\/?$/
);

const engagementId = routeMatch?.[1];
const findingId = routeMatch?.[2];

const findingsPath = engagementId
? `/engagements/${encodeURIComponent(engagementId)}/findings`
: null;

const findingPath = findingsPath && findingId
? `${findingsPath}/${encodeURIComponent(findingId)}`
: null;

const targetsPath = engagementId
? `/engagements/${encodeURIComponent(engagementId)}/targets`
: null;

const el = {
    alert: document.querySelector("#finding-details-alert"),
    heading: document.querySelector("#finding-heading"),
    subheading: document.querySelector("#finding-subheading"),
    back: document.querySelector("#back-to-findings"),
    actions: document.querySelector("#finding-actions"),
    editButton: document.querySelector("#edit-finding-button"),
    deleteButton: document.querySelector("#delete-finding-button"),
    badges: document.querySelector("#finding-badges"),
    overview: document.querySelector("#finding-overview"),
    description: document.querySelector("#finding-description"),
    remediation: document.querySelector("#finding-remediation"),
    references: document.querySelector("#finding-references"),
    targets: document.querySelector("#linked-targets"),
    targetsCount: document.querySelector("#linked-targets-count"),
    services: document.querySelector("#linked-services"),
    servicesCount: document.querySelector("#linked-services-count"),
    editPanel: document.querySelector("#finding-edit-panel"),
    editForm: document.querySelector("#finding-edit-form"),
    cancelEdit: document.querySelector("#cancel-finding-edit"),
    cancelEditBottom: document.querySelector("#cancel-finding-edit-bottom"),
    saveEdit: document.querySelector("#save-finding-edit"),
    targetOptions: document.querySelector("#edit-target-options"),
    serviceOptions: document.querySelector("#edit-service-options"),
};

let currentUser = null;
let isPentester = false;
let finding = null;
let linkedTargets = [];
let linkedServices = [];
let availableTargets = [];
let availableServices = [];
let saving = false;

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    })[character]);
}

function displayValue(value) {
    return value === null || value === undefined || value === ""
    ? "—"
    : escapeHtml(value);
}

function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return escapeHtml(value);

    return escapeHtml(date.toLocaleString());
}

function showAlert(message, type = "info") {
    el.alert.className = `alert alert-${type}`;
    el.alert.textContent = message;
    el.alert.hidden = false;
}

function clearAlert() {
    el.alert.hidden = true;
    el.alert.textContent = "";
}

function severityBadge(severity) {
    const value = String(severity ?? "").toLowerCase();
    const allowed = ["critical", "high", "medium", "low", "info"];
    const className = allowed.includes(value) ? value : "unknown";

    return `<span class="rv-badge rv-badge--${className}">${displayValue(severity)}</span>`;
}

function statusBadge(status) {
    const value = String(status ?? "").toLowerCase().replaceAll(" ", "-");
    const allowed = ["open", "in-progress", "resolved", "accepted"];
    const className = allowed.includes(value) ? value : "unknown";

    return `<span class="rv-badge rv-badge--${className}">${displayValue(status)}</span>`;
}

function renderOverview() {
    const fields = [
        ["Finding ID", finding.finding_id],
        ["Severity", finding.severity],
        ["Status", finding.status],
        ["CVSS vector", finding.cvss_vector],
        ["Discovered", formatDate(finding.discovered_at)],
        ["Resolved", formatDate(finding.resolved_at)],
        ["Created", formatDate(finding.created_at)],
        ["Last updated", formatDate(finding.updated_at)],
        ["Creator user ID", finding.creator_user_id],
        ["Engagement ID", finding.engagement_id],
    ];

    el.overview.innerHTML = fields.map(([label, value]) => `
    <div class="finding-detail-item">
    <span class="finding-detail-label">${escapeHtml(label)}</span>
    <span class="finding-detail-value">${displayValue(value)}</span>
    </div>
    `).join("");

    el.badges.innerHTML =
    `${severityBadge(finding.severity)} ${statusBadge(finding.status)}`;

    el.heading.textContent = finding.title || "Finding details";
    el.subheading.textContent = `Finding #${finding.finding_id}`;
    document.title = `${finding.title || "Finding details"} | ReconVault`;

    el.description.textContent = finding.description || "No description provided.";
    el.remediation.textContent = finding.remediation || "No remediation provided.";
    el.references.textContent = finding.references || "No references provided.";
}

function targetDetailUrl(targetId) {
    return `/engagements/${encodeURIComponent(engagementId)}/targets/${encodeURIComponent(targetId)}`;
}

function renderLinkedTargets() {
    el.targetsCount.textContent =
    `${linkedTargets.length} target${linkedTargets.length === 1 ? "" : "s"}`;

    if (!linkedTargets.length) {
        el.targets.innerHTML = '<p class="empty-state">No linked targets.</p>';
        return;
    }

    el.targets.innerHTML = `
    <div class="table-wrap">
    <table class="data-table">
    <thead>
    <tr>
    <th scope="col">IP address</th>
    <th scope="col">Hostname</th>
    <th scope="col">Domain</th>
    <th scope="col">Operating system</th>
    <th scope="col">Actions</th>
    </tr>
    </thead>
    <tbody>
    ${linkedTargets.map((target) => `
        <tr>
        <td>${displayValue(target.ip_address)}</td>
        <td>${displayValue(target.hostname)}</td>
        <td>${displayValue(target.domain_name)}</td>
        <td>${displayValue(target.operating_system)}</td>
        <td>
        <a class="btn btn-sm btn-outline-secondary"
        href="${targetDetailUrl(target.target_id)}">View target</a>
        </td>
        </tr>
        `).join("")}
        </tbody>
        </table>
        </div>
        `;
}

function renderLinkedServices() {
    el.servicesCount.textContent =
    `${linkedServices.length} service${linkedServices.length === 1 ? "" : "s"}`;

    if (!linkedServices.length) {
        el.services.innerHTML = '<p class="empty-state">No linked services.</p>';
        return;
    }

    el.services.innerHTML = `
    <div class="table-wrap">
    <table class="data-table">
    <thead>
    <tr>
    <th scope="col">Target IP</th>
    <th scope="col">Port</th>
    <th scope="col">Service</th>
    <th scope="col">Protocol</th>
    <th scope="col">Version</th>
    <th scope="col">State</th>
    <th scope="col">Actions</th>
    </tr>
    </thead>
    <tbody>
    ${linkedServices.map((service) => `
        <tr>
        <td>${displayValue(service.ip_address)}</td>
        <td>${displayValue(service.port)}</td>
        <td>${displayValue(service.name)}</td>
        <td>${displayValue(service.protocol)}</td>
        <td>${displayValue(service.version)}</td>
        <td>${displayValue(service.state)}</td>
        <td>
        <a class="btn btn-sm btn-outline-secondary"
        href="${targetDetailUrl(service.target_id)}">View target</a>
        </td>
        </tr>
        `).join("")}
        </tbody>
        </table>
        </div>
        `;
}

async function loadFinding() {
    if (!findingPath) {
        showAlert("Invalid finding URL.", "danger");
        return;
    }

    el.overview.innerHTML = '<p class="empty-state">Loading finding details…</p>';

    try {
        const result = await api.get(findingPath);

        if (!result?.finding) {
            throw new Error("The server did not return finding details.");
        }

        finding = result.finding;
        linkedTargets = Array.isArray(result.targets) ? result.targets : [];
        linkedServices = Array.isArray(result.services) ? result.services : [];

        renderOverview();
        renderLinkedTargets();
        renderLinkedServices();
        el.actions.hidden = !isPentester;
    } catch (error) {
        showAlert(error.message || "Unable to load finding details.", "danger");
        el.overview.innerHTML = '<p class="empty-state">Unable to load finding details.</p>';
    }
}

async function loadAvailableAssets() {
    const result = await api.get(targetsPath);
    availableTargets = Array.isArray(result?.targets) ? result.targets : [];

    const serviceGroups = await Promise.all(
        availableTargets.map(async (target) => {
            try {
                const path =
                `${targetsPath}/${encodeURIComponent(target.target_id)}/services`;
                const serviceResult = await api.get(path);

                return (serviceResult?.services ?? []).map((service) => ({
                    ...service,
                    target_id: target.target_id,
                    target_ip: target.ip_address,
                }));
            } catch {
                return [];
            }
        })
    );

    availableServices = serviceGroups.flat();
}

function renderEditAssetOptions(selectedTargetIds = [], selectedServiceIds = []) {
    if (!availableTargets.length) {
        el.targetOptions.innerHTML = '<p class="empty-state">No targets available.</p>';
    } else {
        el.targetOptions.innerHTML = availableTargets.map((target) => {
            const id = String(target.target_id);
            const checked = selectedTargetIds.includes(id) ? "checked" : "";

            return `
            <label class="asset-option">
            <input type="checkbox" name="target_ids"
            value="${escapeHtml(id)}" ${checked}>
            <span>
            <strong>${displayValue(target.ip_address)}</strong>
            <small>${displayValue(target.hostname || target.domain_name)}</small>
            </span>
            </label>
            `;
        }).join("");
    }

    if (!availableServices.length) {
        el.serviceOptions.innerHTML = '<p class="empty-state">No services available.</p>';
    } else {
        el.serviceOptions.innerHTML = availableServices.map((service) => {
            const id = String(service.service_id);
            const checked = selectedServiceIds.includes(id) ? "checked" : "";

            return `
            <label class="asset-option">
            <input type="checkbox" name="service_ids"
            value="${escapeHtml(id)}" ${checked}>
            <span>
            <strong>
            ${displayValue(service.name)}
            — ${displayValue(service.port)}/${displayValue(service.protocol)}
            </strong>
            <small>${displayValue(service.target_ip)}</small>
            </span>
            </label>
            `;
        }).join("");
    }
}

function selectedIds(name) {
    return [...el.editForm.querySelectorAll(`input[name="${name}"]:checked`)]
    .map((input) => Number(input.value))
    .filter((id) => Number.isSafeInteger(id) && id > 0);
}

async function openEditForm() {
    if (!isPentester || !finding) return;

    clearAlert();

    try {
        await loadAvailableAssets();

        el.editForm.elements.title.value = finding.title ?? "";
        el.editForm.elements.description.value = finding.description ?? "";
        el.editForm.elements.severity.value = finding.severity ?? "MEDIUM";
        el.editForm.elements.status.value = finding.status ?? "OPEN";
        el.editForm.elements.cvss_vector.value = finding.cvss_vector ?? "";
        el.editForm.elements.references.value = finding.references ?? "";
        el.editForm.elements.remediation.value = finding.remediation ?? "";

        renderEditAssetOptions(
            linkedTargets.map((target) => String(target.target_id)),
                               linkedServices.map((service) => String(service.service_id))
        );

        el.editPanel.hidden = false;
        el.editPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
        showAlert(error.message || "Unable to load assets for editing.", "danger");
    }
}

function closeEditForm() {
    el.editPanel.hidden = true;
}

async function saveEdit(event) {
    event.preventDefault();
    if (!isPentester || saving || !finding) return;

    clearAlert();

    const formData = new FormData(el.editForm);
    const targetIds = selectedIds("target_ids");
    const serviceIds = selectedIds("service_ids");

    if (!targetIds.length && !serviceIds.length) {
        showAlert("Select at least one affected target or service.", "warning");
        return;
    }

    const payload = {
        title: String(formData.get("title") ?? "").trim(),
        description: String(formData.get("description") ?? "").trim(),
        severity: formData.get("severity"),
        status: formData.get("status"),
        cvss_vector: String(formData.get("cvss_vector") ?? "").trim(),
        references: String(formData.get("references") ?? "").trim(),
        remediation: String(formData.get("remediation") ?? "").trim(),
        target_ids: targetIds,
        service_ids: serviceIds,
    };

    if (!payload.title || !payload.description) {
        showAlert("Title and description are required.", "warning");
        return;
    }

    saving = true;
    el.saveEdit.disabled = true;
    el.saveEdit.textContent = "Saving…";

    try {
        await api.put(findingPath, payload);
        closeEditForm();
        showAlert("Finding updated successfully.", "success");
        await loadFinding();
    } catch (error) {
        showAlert(error.message || "Unable to update finding.", "danger");
    } finally {
        saving = false;
        el.saveEdit.disabled = false;
        el.saveEdit.textContent = "Save changes";
    }
}

async function deleteFinding() {
    if (!isPentester || !finding) return;

    if (!window.confirm(
        `Delete finding "${finding.title}"? This action cannot be undone.`
    )) {
        return;
    }

    try {
        await api.delete(findingPath);
        window.location.assign(findingsPath);
    } catch (error) {
        showAlert(error.message || "Unable to delete finding.", "danger");
    }
}

el.editButton.addEventListener("click", openEditForm);
el.deleteButton.addEventListener("click", deleteFinding);
el.cancelEdit.addEventListener("click", closeEditForm);
el.cancelEditBottom.addEventListener("click", closeEditForm);
el.editForm.addEventListener("submit", saveEdit);

async function initialize() {
    if (!engagementId || !findingId) {
        showAlert("Invalid finding URL.", "danger");
        return;
    }

    el.back.href = findingsPath;

    try {
        currentUser = await getCurrentUser();
        isPentester = hasRole(currentUser, "PENTESTER");

        await loadFinding();
    } catch (error) {
        showAlert(error.message || "Unable to initialize finding details.", "danger");
    }
}

initialize();
