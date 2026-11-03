import { api } from "../api.js";
import { getCurrentUser, hasRole } from "../auth.js";

const routeMatch = window.location.pathname.match(
    /\/engagements\/([1-9]\d*)\/findings\/?$/
);

const engagementId = routeMatch?.[1];

const findingsPath = engagementId
? `/engagements/${encodeURIComponent(engagementId)}/findings`
: null;

const targetsPath = engagementId
? `/engagements/${encodeURIComponent(engagementId)}/targets`
: null;

const elements = {
    alert: document.querySelector("#findings-alert"),
    createButton: document.querySelector("#create-finding-button"),
    formPanel: document.querySelector("#finding-form-panel"),
        formTitle: document.querySelector("#finding-form-title"),
            form: document.querySelector("#finding-form"),
                cancelButton: document.querySelector("#cancel-finding-form"),
                cancelBottomButton: document.querySelector("#cancel-finding-form-bottom"),
                saveButton: document.querySelector("#save-finding-button"),
                content: document.querySelector("#findings-content"),
                count: document.querySelector("#findings-count"),
                refreshButton: document.querySelector("#refresh-findings-button"),
                targetOptions: document.querySelector("#finding-target-options"),
                serviceOptions: document.querySelector("#finding-service-options"),
};

let currentUser = null;
let isPentester = false;
let findings = [];
let targets = [];
let services = [];
let editingFindingId = null;
let loading = false;
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
    elements.alert.className = `alert alert-${type}`;
    elements.alert.textContent = message;
    elements.alert.hidden = false;
}

function clearAlert() {
    elements.alert.hidden = true;
    elements.alert.textContent = "";
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

function detailUrl(findingId) {
    return `/engagements/${encodeURIComponent(engagementId)}/findings/${encodeURIComponent(findingId)}`;
}

function renderFindings() {
    elements.count.textContent =
    `${findings.length} finding${findings.length === 1 ? "" : "s"}`;

    if (!findings.length) {
        elements.content.innerHTML = `
        <div class="empty-state">
        <h3>No findings recorded</h3>
        <p>Findings discovered during this engagement will appear here.</p>
        </div>
        `;
        return;
    }

    elements.content.innerHTML = `
    <div class="table-wrap">
    <table class="data-table">
    <thead>
    <tr>
    <th scope="col">Severity</th>
    <th scope="col">Finding</th>
    <th scope="col">Status</th>
    <th scope="col">Discovered</th>
    <th scope="col">Actions</th>
    </tr>
    </thead>
    <tbody>
    ${findings.map((finding) => {
        const id = finding.finding_id;
        const validId = /^[1-9]\d*$/.test(String(id ?? ""));

        return `
        <tr>
        <td>${severityBadge(finding.severity)}</td>
        <td>
        <div class="finding-row-title">
        ${displayValue(finding.title)}
        </div>
        <div class="finding-row-description">
        ${displayValue(
            String(finding.description ?? "").slice(0, 140)
        )}${String(finding.description ?? "").length > 140 ? "…" : ""}
        </div>
        </td>
        <td>${statusBadge(finding.status)}</td>
        <td>${formatDate(finding.discovered_at)}</td>
        <td>
        <div class="cell-actions">
        ${
            validId
            ? `
            <a
            class="btn btn-sm btn-outline-secondary"
            href="${detailUrl(id)}"
            >View</a>
            ${
                isPentester
                ? `
                <button
                type="button"
                class="btn btn-sm btn-outline-secondary"
                data-action="edit"
                data-finding-id="${escapeHtml(id)}"
                >Edit</button>
                <button
                type="button"
                class="btn btn-sm btn-outline-danger"
                data-action="delete"
                data-finding-id="${escapeHtml(id)}"
                >Delete</button>
                `
                : ""
            }
            `
            : '<span class="text-muted">Unavailable</span>'
        }
        </div>
        </td>
        </tr>
        `;
    }).join("")}
    </tbody>
    </table>
    </div>
    `;
}

async function loadFindings() {
    if (!findingsPath || loading) return;

    loading = true;
    elements.refreshButton.disabled = true;
    elements.content.innerHTML = '<p class="empty-state">Loading findings…</p>';

    try {
        const result = await api.get(findingsPath);
        findings = Array.isArray(result?.findings) ? result.findings : [];
        renderFindings();
    } catch (error) {
        elements.content.innerHTML = `
        <p class="empty-state">Unable to load findings.</p>
        `;
        showAlert(error.message || "Unable to load findings.", "danger");
    } finally {
        loading = false;
        elements.refreshButton.disabled = false;
    }
}

async function loadAssets() {
    if (!targetsPath) return;

    elements.targetOptions.innerHTML =
    '<span class="text-muted">Loading targets…</span>';
    elements.serviceOptions.innerHTML =
    '<span class="text-muted">Loading services…</span>';

    try {
        const result = await api.get(targetsPath);
        targets = Array.isArray(result?.targets) ? result.targets : [];

        const serviceResults = await Promise.all(
            targets.map(async (target) => {
                if (!target.target_id) return [];

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

        services = serviceResults.flat();
        renderAssetOptions();
    } catch (error) {
        targets = [];
        services = [];
        elements.targetOptions.textContent = "Unable to load targets.";
        elements.serviceOptions.textContent = "Unable to load services.";
        showAlert(error.message || "Unable to load engagement assets.", "danger");
    }
}

function renderAssetOptions(selectedTargetIds = [], selectedServiceIds = []) {
    if (!targets.length) {
        elements.targetOptions.innerHTML =
        '<span class="text-muted">No targets available.</span>';
    } else {
        elements.targetOptions.innerHTML = targets.map((target) => {
            const id = String(target.target_id);
            const checked = selectedTargetIds.includes(id) ? "checked" : "";

            return `
            <label class="asset-option">
            <input
            type="checkbox"
            name="target_ids"
            value="${escapeHtml(id)}"
            ${checked}
            >
            <span>
            <strong>${displayValue(target.ip_address)}</strong>
            <small>${displayValue(target.hostname || target.domain_name)}</small>
            </span>
            </label>
            `;
        }).join("");
    }

    if (!services.length) {
        elements.serviceOptions.innerHTML =
        '<span class="text-muted">No services available for the engagement targets.</span>';
    } else {
        elements.serviceOptions.innerHTML = services.map((service) => {
            const id = String(service.service_id);
            const checked = selectedServiceIds.includes(id) ? "checked" : "";

            return `
            <label class="asset-option">
            <input
            type="checkbox"
            name="service_ids"
            value="${escapeHtml(id)}"
            ${checked}
            >
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

function getSelectedIds(name) {
    return [...elements.form.querySelectorAll(`input[name="${name}"]:checked`)]
    .map((input) => Number(input.value))
    .filter((id) => Number.isSafeInteger(id) && id > 0);
}

function resetForm() {
    elements.form.reset();
    editingFindingId = null;
    elements.formTitle.textContent = "Create finding";
    elements.saveButton.textContent = "Save finding";
    elements.saveButton.disabled = false;
    elements.formPanel.hidden = true;
    renderAssetOptions();
}

function openCreateForm() {
    clearAlert();
    resetForm();
    elements.formTitle.textContent = "Create finding";
    elements.formPanel.hidden = false;
    elements.formPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openEditForm(finding) {
    clearAlert();
    resetForm();

    editingFindingId = finding.finding_id;
    elements.formTitle.textContent = "Edit finding";
    elements.saveButton.textContent = "Save changes";

    elements.form.elements.title.value = finding.title ?? "";
    elements.form.elements.description.value = finding.description ?? "";
    elements.form.elements.severity.value = finding.severity ?? "MEDIUM";
    elements.form.elements.status.value = finding.status ?? "OPEN";
    elements.form.elements.cvss_vector.value = finding.cvss_vector ?? "";
    elements.form.elements.references.value = finding.references ?? "";
    elements.form.elements.remediation.value = finding.remediation ?? "";

    elements.formPanel.hidden = false;

    loadFindingLinks(finding.finding_id)
    .then(({ targetIds, serviceIds }) => {
        if (String(editingFindingId) !== String(finding.finding_id)) return;
        renderAssetOptions(targetIds, serviceIds);
    })
    .catch((error) => {
        showAlert(error.message || "Unable to load linked assets.", "danger");
    });

    elements.formPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadFindingLinks(findingId) {
    const result = await api.get(
        `${findingsPath}/${encodeURIComponent(findingId)}`
    );

    return {
        targetIds: (result?.targets ?? []).map((target) => String(target.target_id)),
        serviceIds: (result?.services ?? []).map((service) => String(service.service_id)),
    };
}

async function saveFinding(event) {
    event.preventDefault();
    if (!isPentester || saving) return;

    clearAlert();

    const formData = new FormData(elements.form);
    const targetIds = getSelectedIds("target_ids");
    const serviceIds = getSelectedIds("service_ids");

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

    const wasEditing = editingFindingId !== null;
    const findingId = editingFindingId;

    saving = true;
    elements.saveButton.disabled = true;
    elements.saveButton.textContent = "Saving…";

    try {
        if (wasEditing) {
            await api.put(
                `${findingsPath}/${encodeURIComponent(findingId)}`,
                          payload
            );
        } else {
            await api.post(findingsPath, payload);
        }

        resetForm();
        showAlert(
            wasEditing ? "Finding updated successfully." : "Finding created successfully.",
            "success"
        );

        await loadFindings();
    } catch (error) {
        showAlert(error.message || "Unable to save finding.", "danger");
    } finally {
        saving = false;
        elements.saveButton.disabled = false;
        elements.saveButton.textContent = editingFindingId ? "Save changes" : "Save finding";
    }
}

async function deleteFinding(findingId) {
    if (!isPentester) return;

    const finding = findings.find(
        (item) => String(item.finding_id) === String(findingId)
    );

    const confirmed = window.confirm(
        `Delete finding "${finding?.title ?? findingId}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    clearAlert();

    try {
        await api.delete(
            `${findingsPath}/${encodeURIComponent(findingId)}`
        );

        if (String(editingFindingId) === String(findingId)) {
            resetForm();
        }

        showAlert("Finding deleted successfully.", "success");
        await loadFindings();
    } catch (error) {
        showAlert(error.message || "Unable to delete finding.", "danger");
    }
}

elements.createButton.addEventListener("click", openCreateForm);
elements.cancelButton.addEventListener("click", resetForm);
elements.cancelBottomButton.addEventListener("click", resetForm);
elements.form.addEventListener("submit", saveFinding);
elements.refreshButton.addEventListener("click", loadFindings);

elements.content.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const { action, findingId } = button.dataset;

    if (action === "edit" && isPentester) {
        const finding = findings.find(
            (item) => String(item.finding_id) === String(findingId)
        );

        if (finding) openEditForm(finding);
    } else if (action === "delete" && isPentester) {
        deleteFinding(findingId);
    }
});

async function initialize() {
    if (!engagementId) {
        showAlert("Invalid engagement URL.", "danger");
        elements.content.innerHTML = "";
        return;
    }

    try {
        currentUser = await getCurrentUser();
        isPentester = hasRole(currentUser, "PENTESTER");

        elements.createButton.hidden = !isPentester;
        elements.createButton.disabled = !isPentester;

        if (isPentester) {
            await loadAssets();
        }

        await loadFindings();
    } catch (error) {
        showAlert(error.message || "Unable to initialize findings.", "danger");
    }
}

initialize();
