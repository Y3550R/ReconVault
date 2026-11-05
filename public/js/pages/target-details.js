
import { getCurrentUser, hasRole } from "../auth.js";
import { api } from "../api.js";
import { renderHeader } from "../layout.js";
import { renderContributors } from "../contributors.js";

const targetTitle = document.getElementById("target-page-title");
const targetSubtitle = document.getElementById("target-page-subtitle");
const backLink = document.getElementById("back-to-targets");
const refreshButton = document.getElementById("refresh-target-details");

const targetAlert = document.getElementById("target-details-alert");
const overviewContent = document.getElementById("target-overview-content");
const statusElement = document.getElementById("target-status");

const createServiceButton = document.getElementById("create-service");
const servicesAlert = document.getElementById("services-alert");
const servicesContent = document.getElementById("services-content");

const serviceFormPanel = document.getElementById("service-form-panel");
const serviceForm = document.getElementById("service-form");
const serviceFormTitle = document.getElementById("service-form-title");
const serviceFormAlert = document.getElementById("service-form-alert");
const saveServiceButton = document.getElementById("save-service");
const cancelServiceButton = document.getElementById("cancel-service");

const serviceDetailsPanel = document.getElementById("service-details-panel");
const serviceDetailsTitle = document.getElementById("service-details-title");
const serviceDetailsSubtitle = document.getElementById("service-details-subtitle");
const serviceDetailsContent = document.getElementById("service-details-content");
const closeServiceDetailsButton = document.getElementById("close-service-details");

const serviceFields = {
    name: document.getElementById("service-name"),
    port: document.getElementById("service-port"),
    protocol: document.getElementById("service-protocol"),
    version: document.getElementById("service-version"),
    state: document.getElementById("service-state"),
};

const routeMatch = window.location.pathname.match(
    /\/engagements\/([1-9]\d*)\/targets\/([1-9]\d*)\/?$/
);

const engagementId = routeMatch?.[1];
const targetId = routeMatch?.[2];

let currentUser = null;
let isPentester = false;
let target = null;
let services = [];
let editingServiceId = null;
let loading = false;
let saving = false;

const targetBasePath = engagementId && targetId
    ? `/engagements/${encodeURIComponent(engagementId)}/targets/${encodeURIComponent(targetId)}`
    : null;
const servicesPath = targetBasePath
    ? `${targetBasePath}/services`
    : null;

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    })[char]);
}

function showAlert(element, message, type = "danger") {
    element.className = `alert alert-${type}`;
    element.textContent = message;
}

function hideAlert(element) {
    element.className = "alert d-none";
    element.textContent = "";
}

function displayValue(value) {
    const text = String(value ?? "").trim();
    return text ? escapeHtml(text) : "—";
}

function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return escapeHtml(date.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }));
}

function renderStatus(status) {
    const normalized = String(status ?? "UNKNOWN").toUpperCase();
    const statusClass =
        normalized === "ACTIVE" ? "active" :
            normalized === "INACTIVE" ? "inactive" : "";

    statusElement.className = `rv-badge${statusClass ? ` rv-badge--${statusClass}` : ""}`;
    statusElement.textContent = normalized;
}

function renderTargetDetails() {
    if (!target) return;

    const ipAddress = target.ip_address || "Target details";

    targetTitle.textContent = ipAddress;
    targetSubtitle.textContent = [
        target.hostname,
        target.domain_name,
    ].filter(Boolean).join(" · ") || "Target identification and configuration";

    renderStatus(target.status);

    const details = [
        ["IP address", target.ip_address],
        ["IP type", target.ip_type],
        ["Hostname", target.hostname],
        ["Domain name", target.domain_name],
        ["Operating system", target.operating_system],
        ["Status", target.status],
        ["Created", formatDate(target.created_at)],
        ["Last updated", formatDate(target.updated_at)],
        ["Target ID", target.target_id ?? target.id],
        ["Engagement ID", target.engagement_id ?? engagementId],
    ];

    overviewContent.innerHTML = `
    <div class="target-primary-info">
    <span class="target-info-label">IP address</span>
    <strong class="target-primary-ip">${displayValue(target.ip_address)}</strong>
    <span class="target-primary-type">${displayValue(target.ip_type)}</span>
    </div>

    ${details
            .filter(([label]) => label !== "IP address")
            .map(([label, value]) => `
        <div class="target-info-item">
        <span class="target-info-label">${escapeHtml(label)}</span>
        <div class="target-info-value">${value === formatDate(target.created_at) && label === "Created"
                    ? value
                    : value === formatDate(target.updated_at) && label === "Last updated"
                        ? value
                        : displayValue(value)}</div>
            </div>
            `).join("")}

            <div class="target-info-item">
            <span class="target-info-label">Contributors</span>
            <div class="target-info-value">${renderContributors(target.contributors)}</div>
            </div>

            <div class="target-info-item target-description-item">
            <span class="target-info-label">Description</span>
            <div class="target-info-value target-full-description">${displayValue(target.description)}</div>
            </div>
            `;
}

function renderServiceState(state) {
    const normalized = String(state ?? "UNKNOWN").toUpperCase();
    const stateClass = normalized.toLowerCase();

    return `<span class="rv-badge rv-badge--state-${escapeHtml(stateClass)}">${escapeHtml(normalized)}</span>`;
}

function renderServices() {
    if (!services.length) {
        servicesContent.innerHTML = `
        <div class="empty-state">
        <h3>No services found</h3>
        <p>No services have been recorded for this target.</p>
        ${isPentester
                ? `<p>Use <strong>Add service</strong> to record a discovered service.</p>`
                : ""}
            </div>
            `;
        return;
    }


    servicesContent.innerHTML = `
    <div class="list-count">
    ${services.length} service${services.length === 1 ? "" : "s"}
    </div>

    <div class="table-wrap">
    <table class="data-table">
    <thead>
    <tr>
    <th scope="col">Port</th>
    <th scope="col">Service</th>
    <th scope="col">Protocol</th>
    <th scope="col">Version</th>
    <th scope="col">State</th>
    <th scope="col">Contributors</th>
    <th scope="col">Actions</th>
    </tr>
    </thead>

    <tbody>
    ${services.map((service) => {
        const serviceId = service.service_id;
        const validId = /^[1-9]\d*$/.test(
            String(serviceId ?? "")
        );

        return `
        <tr>
        <td>
        <span class="service-port">
        ${displayValue(service.port)}
        </span>
        </td>
        <td class="service-name">
        ${displayValue(service.name)}
        </td>
        <td>${displayValue(service.protocol)}</td>
        <td>${displayValue(service.version)}</td>
        <td>${renderServiceState(service.state)}</td>
        <td class="cell-wrap">${renderContributors(service.contributors)}</td>
        <td>
        ${validId
                ? `
            <div class="cell-actions">
            <button
            type="button"
            class="btn btn-sm btn-outline-secondary"
            data-action="view"
            data-service-id="${escapeHtml(serviceId)}"
            >
            View
            </button>

            ${isPentester
                    ? `
                <button
                type="button"
                class="btn btn-sm btn-outline-secondary"
                data-action="edit"
                data-service-id="${escapeHtml(serviceId)}"
                >
                Edit
                </button>

                <button
                type="button"
                class="btn btn-sm btn-outline-danger"
                data-action="delete"
                data-service-id="${escapeHtml(serviceId)}"
                >
                Delete
                </button>
                `
                    : ""
                }
            </div>
            `
                : '<span class="text-muted">Unavailable</span>'
            }
        </td>
        </tr>
        `;
    }).join("")}
    </tbody>
    </table>
    </div>
    `;

}

function renderServiceDetails(service) {
    serviceDetailsTitle.textContent = service.name || "Service details";
    serviceDetailsSubtitle.textContent =
        `${service.protocol || "Unknown protocol"} · Port ${service.port ?? "—"}`;

    const details = [
        ["Service ID", service.service_id],
        ["Name", service.name],
        ["Port", service.port],
        ["Protocol", service.protocol],
        ["Version", service.version],
        ["State", service.state],
        ["Target ID", service.target_id ?? targetId],
        ["Created", service.created_at ? formatDate(service.created_at) : null],
        ["Last updated", service.updated_at ? formatDate(service.updated_at) : null],
    ];

    serviceDetailsContent.innerHTML = details.map(([label, value]) => `
    <div class="service-detail-item">
    <span class="target-info-label">${escapeHtml(label)}</span>
    <div class="target-info-value">${value == null || value === ""
            ? "—"
            : escapeHtml(value)}</div>
        </div>
        `).join("") + `
    <div class="service-detail-item">
    <span class="target-info-label">Contributors</span>
    <div class="target-info-value">${renderContributors(service.contributors)}</div>
    </div>
    `;

    serviceDetailsPanel.hidden = false;
    serviceDetailsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function viewServiceDetails(serviceId) {
    hideAlert(servicesAlert);

    try {
        const result = await api.get(
            `${servicesPath}/${encodeURIComponent(serviceId)}`
        );

        if (!result?.service) {
            throw new Error("The server did not return service details.");
        }

        renderServiceDetails(result.service);
    } catch (error) {
        showAlert(
            servicesAlert,
            error.message || "Unable to load service details."
        );
    }
}

async function loadTargetDetails() {
    if (loading || !targetBasePath) return;

    loading = true;
    refreshButton.disabled = true;
    servicesContent.setAttribute("aria-busy", "true");
    hideAlert(targetAlert);
    hideAlert(servicesAlert);

    try {
        const result = await api.get(targetBasePath);

        if (!result?.target) {
            throw new Error("The server did not return target details.");
        }

        target = result.target;
        renderTargetDetails();

        // The target endpoint also returns services. This is the initial list;
        // service mutations refresh from the dedicated services endpoint.
        if (Array.isArray(result.services)) {
            services = result.services;
            renderServices();
        } else {
            await loadServices();
        }
    } catch (error) {
        showAlert(targetAlert, error.message || "Unable to load target details.");
    } finally {
        loading = false;
        refreshButton.disabled = false;
        servicesContent.setAttribute("aria-busy", "false");
    }
}

async function loadServices() {
    try {
        const result = await api.get(`${servicesPath}/`);
        services = Array.isArray(result?.services) ? result.services : [];
        renderServices();
    } catch (error) {
        showAlert(servicesAlert, error.message || "Unable to load services.");
    }
}

function resetServiceForm() {
    serviceForm.reset();
    serviceFields.protocol.value = "TCP";
    serviceFields.state.value = "UNKNOWN";
    hideAlert(serviceFormAlert);
}

function openCreateServiceForm() {
    if (!isPentester) return;

    editingServiceId = null;
    resetServiceForm();
    serviceFormTitle.textContent = "Add service";
    saveServiceButton.textContent = "Add service";
    serviceFormPanel.hidden = false;
    serviceFormPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    serviceFields.name.focus();
}

function openEditServiceForm(serviceId) {
    if (!isPentester) return;

    const service = services.find(
        (item) => String(item.service_id) === String(serviceId)
    );

    if (!service) {
        showAlert(servicesAlert, "The selected service could not be found.");
        return;
    }

    editingServiceId = String(serviceId);
    resetServiceForm();

    for (const [key, input] of Object.entries(serviceFields)) {
        input.value = service[key] ?? "";
    }

    serviceFormTitle.textContent = "Edit service";
    saveServiceButton.textContent = "Save changes";
    serviceFormPanel.hidden = false;
    serviceFormPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    serviceFields.name.focus();
}

function closeServiceForm() {
    serviceFormPanel.hidden = true;
    editingServiceId = null;
    resetServiceForm();
}

function getServicePayload() {
    return {
        name: serviceFields.name.value.trim(),
        port: Number(serviceFields.port.value),
        protocol: serviceFields.protocol.value,
        version: serviceFields.version.value.trim(),
        state: serviceFields.state.value,
    };
}

async function saveService(event) {
    event.preventDefault();

    if (!isPentester || saving) return;
    if (!serviceForm.reportValidity()) return;

    saving = true;
    saveServiceButton.disabled = true;
    hideAlert(serviceFormAlert);
    const wasEditing = Boolean(editingServiceId);

    try {
        const payload = getServicePayload();

        if (editingServiceId) {
            await api.put(
                `${servicesPath}/${encodeURIComponent(editingServiceId)}`,
                payload
            );
        } else {
            await api.post(`${servicesPath}/`, payload);
        }

        closeServiceForm();
        await loadServices();

        showAlert(
            servicesAlert,
            wasEditing
                ? "Service updated successfully."
                : "Service created successfully.",
            "success"
        );
    } catch (error) {
        showAlert(
            serviceFormAlert,
            error.message || "Unable to save the service."
        );
    } finally {
        saving = false;
        saveServiceButton.disabled = false;
    }
}

async function deleteService(serviceId) {
    if (!isPentester) return;

    const service = services.find(
        (item) => String(item.service_id) === String(serviceId)
    );

    if (!service) {
        showAlert(servicesAlert, "The selected service could not be found.");
        return;
    }

    const confirmed = window.confirm(
        `Delete service "${service.name}" on port ${service.port}? This action cannot be undone.`
    );

    if (!confirmed) return;

    hideAlert(servicesAlert);

    try {
        await api.delete(`${servicesPath}/${encodeURIComponent(serviceId)}`);
        await loadServices();
        showAlert(servicesAlert, "Service deleted successfully.", "success");
    } catch (error) {
        showAlert(servicesAlert, error.message || "Unable to delete the service.");
    }
}

servicesContent.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const { action, serviceId } = button.dataset;

    if (action === "view") viewServiceDetails(serviceId);
    if (action === "edit" && isPentester) openEditServiceForm(serviceId);
    if (action === "delete" && isPentester) deleteService(serviceId);
});

closeServiceDetailsButton.addEventListener("click", () => {
    serviceDetailsPanel.hidden = true;
});

createServiceButton.addEventListener("click", openCreateServiceForm);
cancelServiceButton.addEventListener("click", closeServiceForm);
serviceForm.addEventListener("submit", saveService);
refreshButton.addEventListener("click", loadTargetDetails);

async function initialize() {
    if (!targetBasePath) {
        showAlert(targetAlert, "Invalid target URL.");
        overviewContent.innerHTML = "";
        servicesContent.innerHTML = "";
        refreshButton.disabled = true;
        return;
    }

    backLink.href = `/engagements/${encodeURIComponent(engagementId)}/targets`;

    try {
        currentUser = await getCurrentUser();

        if (!currentUser) {
            const returnTo = encodeURIComponent(window.location.pathname);
            window.location.replace(`/login?returnTo=${returnTo}`);
            return;
        }

        renderHeader({ user: currentUser, activeTab: "engagements" });

        isPentester = hasRole(currentUser, "PENTESTER");
        createServiceButton.hidden = !isPentester;

        await loadTargetDetails();
    } catch (error) {
        showAlert(targetAlert, error.message || "Unable to initialize the target page.");
    }
}

initialize();
