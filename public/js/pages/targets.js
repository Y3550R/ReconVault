
import { getCurrentUser, hasRole } from "../auth.js";
import { api } from "../api.js";
import { renderHeader } from "../layout.js";

const content = document.getElementById("targets-content");
const alertBox = document.getElementById("targets-alert");
const refreshButton = document.getElementById("refresh-targets");
const createButton = document.getElementById("create-target");

const formPanel = document.getElementById("target-form-panel");
const formTitle = document.getElementById("target-form-title");
const cancelButton = document.getElementById("cancel-target");

const targetForm = document.getElementById("target-form");
const saveButton = document.getElementById("save-target");
const formAlert = document.getElementById("target-form-alert");

const fields = {
    ip_address: document.getElementById("target-ip-address"),
    ip_type: document.getElementById("target-ip-type"),
    hostname: document.getElementById("target-hostname"),
    domain_name: document.getElementById("target-domain"),
    operating_system: document.getElementById("target-os"),
    status: document.getElementById("target-status"),
    description: document.getElementById("target-description"),
};

const engagementMatch = window.location.pathname.match(
    /\/engagements\/([1-9]\d*)\/targets\/?$/
);

const engagementId = engagementMatch?.[1];

let currentUser = null;
let isPentester = false;
let targets = [];
let editingTargetId = null;
let loading = false;
let saving = false;

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
    });
}

function renderStatus(status) {
    const normalized = String(status ?? "UNKNOWN").toUpperCase();

    return `<span class="rv-badge rv-badge--${normalized.toLowerCase()}">${escapeHtml(normalized)}</span>`;
}

function renderEmptyState() {
    content.innerHTML = `
    <div class="empty-state">
        <h2>No targets found</h2>
        <p>No targets have been added to this engagement yet.</p>
    </div>
    `;
}

function renderTargets() {
    if (!targets.length) {
        renderEmptyState();
        return;
    }

    content.innerHTML = `
    <div class="list-count">
    ${targets.length} target${targets.length === 1 ? "" : "s"}
    </div>
    <div class="table-wrap">
    <table class="data-table">
    <thead>
    <tr>
    <th scope="col">IP Address</th>
    <th scope="col">Hostname</th>
    <th scope="col">Domain</th>
    <th scope="col">Operating System</th>
    <th scope="col">Status</th>
    <th scope="col">Description</th>
    <th scope="col">Added</th>
    <th scope="col">Actions</th>
    </tr>
    </thead>
    <tbody>
    ${targets.map((target) => {
        const targetId = target.target_id ?? target.id;
        const validId = /^[1-9]\d*$/.test(String(targetId ?? ""));

        const detailUrl = validId
            ? `/engagements/${encodeURIComponent(engagementId)}/targets/${encodeURIComponent(targetId)}`
            : null;

        const actions = detailUrl
            ? `
        <div class="cell-actions">
        <a class="btn btn-sm btn-outline-secondary"
        href="${detailUrl}">View</a>
        ${isPentester ? `
            <button type="button"
            class="btn btn-sm btn-outline-secondary"
            data-action="edit"
            data-target-id="${escapeHtml(targetId)}">Edit</button>
            <button type="button"
            class="btn btn-sm btn-outline-danger"
            data-action="delete"
            data-target-id="${escapeHtml(targetId)}">Delete</button>
            ` : ""}
            </div>
            `
            : `<span class="text-muted">Unavailable</span>`;

        return `
            <tr>
            <td>
            <span class="target-ip">${escapeHtml(target.ip_address || "—")}</span>
            <span class="target-ip-type">${escapeHtml(target.ip_type || "")}</span>
            </td>
            <td>${escapeHtml(target.hostname || "—")}</td>
            <td>${escapeHtml(target.domain_name || "—")}</td>
            <td>${escapeHtml(target.operating_system || "—")}</td>
            <td>${renderStatus(target.status)}</td>
            <td class="target-description">${escapeHtml(target.description || "—")}</td>
            <td>${escapeHtml(formatDate(target.created_at))}</td>
            <td>${actions}</td>
            </tr>
            `;
    }).join("")}
    </tbody>
    </table>
    </div>
    `;
}

async function loadTargets() {
    if (loading || !engagementId) return;

    loading = true;
    refreshButton.disabled = true;
    content.setAttribute("aria-busy", "true");
    hideAlert();

    try {
        const result = await api.get(
            `/engagements/${encodeURIComponent(engagementId)}/targets`
        );

        targets = Array.isArray(result?.targets) ? result.targets : [];
        renderTargets();
    } catch (error) {
        showAlert(error.message || "Unable to load targets.");
    } finally {
        loading = false;
        refreshButton.disabled = false;
        content.setAttribute("aria-busy", "false");
    }
}

function resetForm() {
    targetForm.reset();
    fields.ip_type.value = "IPV4";
    fields.status.value = "ACTIVE";
    hideFormAlert();
}

function openCreateForm() {
    if (!isPentester) return;

    editingTargetId = null;
    resetForm();

    formTitle.textContent = "Create target";
    saveButton.textContent = "Create target";
    formPanel.hidden = false;

    formPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    fields.ip_address.focus();
}

function openEditForm(targetId) {
    if (!isPentester) return;

    const target = targets.find(
        (item) => String(item.target_id ?? item.id) === String(targetId)
    );

    if (!target) {
        showAlert("The selected target could not be found.");
        return;
    }

    editingTargetId = String(targetId);
    resetForm();

    for (const [key, input] of Object.entries(fields)) {
        input.value = target[key] ?? "";
    }

    formTitle.textContent = "Edit target";
    saveButton.textContent = "Save changes";
    formPanel.hidden = false;

    formPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    fields.ip_address.focus();
}

function closeTargetForm() {
    formPanel.hidden = true;
    editingTargetId = null;
    resetForm();
}

createButton.addEventListener("click", openCreateForm);
cancelButton.addEventListener("click", closeTargetForm);

function getFormPayload() {
    return {
        ip_address: fields.ip_address.value.trim(),
        ip_type: fields.ip_type.value,
        hostname: fields.hostname.value.trim(),
        domain_name: fields.domain_name.value.trim(),
        operating_system: fields.operating_system.value.trim(),
        status: fields.status.value,
        description: fields.description.value.trim(),
    };
}

async function saveTarget(event) {
    event.preventDefault();

    if (!isPentester || saving) return;
    if (!targetForm.reportValidity()) return;

    saving = true;
    saveButton.disabled = true;
    hideFormAlert();

    try {
        const payload = getFormPayload();

        if (editingTargetId) {
            await api.put(
                `/engagements/${encodeURIComponent(engagementId)}/targets/${encodeURIComponent(editingTargetId)}`,
                payload
            );
        } else {
            await api.post(
                `/engagements/${encodeURIComponent(engagementId)}/targets`,
                payload
            );
        }

        closeTargetForm();
        await loadTargets();
        showAlert(
            editingTargetId ? "Target updated successfully." : "Target created successfully.",
            "success"
        );
    } catch (error) {
        showFormAlert(error.message || "Unable to save the target.");
    } finally {
        saving = false;
        saveButton.disabled = false;
    }
}

async function deleteTarget(targetId) {
    if (!isPentester) return;

    const target = targets.find(
        (item) => String(item.target_id ?? item.id) === String(targetId)
    );

    if (!target) {
        showAlert("The selected target could not be found.");
        return;
    }

    const confirmed = window.confirm(
        `Delete target "${target.ip_address || targetId}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    hideAlert();

    try {
        await api.delete(
            `/engagements/${encodeURIComponent(engagementId)}/targets/${encodeURIComponent(targetId)}`
        );

        await loadTargets();
        showAlert("Target deleted successfully.", "success");
    } catch (error) {
        showAlert(error.message || "Unable to delete the target.");
    }
}

content.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button || !isPentester) return;

    const { action, targetId } = button.dataset;

    if (action === "edit") openEditForm(targetId);
});

refreshButton.addEventListener("click", loadTargets);
targetForm.addEventListener("submit", saveTarget);

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

        renderHeader({ user: currentUser, activeTab: "engagements" });

        isPentester = hasRole(currentUser, "PENTESTER");
        createButton.hidden = !isPentester;

        await loadTargets();
    } catch (error) {
        showAlert(error.message || "Unable to initialize the targets page.");
    }
}

initialize();
