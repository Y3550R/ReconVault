import { getCurrentUser } from "../auth.js";
import { renderHeader } from "../layout.js";
import { api } from "../api.js";

const $ = (selector) => document.querySelector(selector);

let organizations = [];

function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[char]));
}

function unwrapList(data, keys = []) {
    if (Array.isArray(data)) return data;

    for (const key of keys) {
        if (Array.isArray(data?.[key])) return data[key];
    }

    if (Array.isArray(data?.data)) return data.data;
    return [];
}

function organizationId(organization) {
    return organization.organization_id ?? organization.id;
}

function showMessage(message, type = "danger") {
    $("#organization-message").innerHTML = message
        ? `<div class="alert alert-${type}" role="alert">${esc(message)}</div>`
        : "";
}

function openForm(organization = null) {
    $("#organization-form").reset();
    $("#organization-id").value = organization
        ? organizationId(organization)
        : "";
    $("#organization-name").value = organization?.name ?? "";
    $("#contact-information").value = organization?.contact_information ?? "";
    $("#organization-form-title").textContent = organization
        ? "Edit Organization"
        : "Create Organization";

    $("#organization-form-panel").hidden = false;
    $("#organization-form-panel").scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

function closeForm() {
    $("#organization-form-panel").hidden = true;
    $("#organization-form").reset();
}

function renderOrganizations() {
    const search = $("#organization-search").value.trim().toLowerCase();

    const filtered = organizations.filter((organization) =>
        String(organization.name ?? "").toLowerCase().includes(search)
    );

    if (!filtered.length) {
        $("#organization-table-container").innerHTML = `
        <div class="empty-state">
        <h3 class="h6">No organizations found</h3>
        <p class="text-muted mb-0">
        Try a different search or create an organization.
        </p>
        </div>
        `;
        return;
    }

    $("#organization-table-container").innerHTML = `
    <div class="table-responsive">
    <table class="table align-middle">
    <thead>
    <tr>
    <th>Organization</th>
    <th>Contact Information</th>
    <th>Organization ID</th>
    <th class="text-end">Actions</th>
    </tr>
    </thead>
    <tbody>
    ${filtered.map((organization) => `
        <tr>
        <td class="fw-semibold">${esc(organization.name)}</td>
        <td>${esc(organization.contact_information || "—")}</td>
        <td>${esc(organizationId(organization) ?? "—")}</td>
        <td class="text-end">
        <button
        class="btn btn-sm btn-outline-secondary"
        data-edit-organization="${esc(organizationId(organization))}"
        >Edit</button>
        </td>
        </tr>
        `).join("")}
        </tbody>
        </table>
        </div>
        `;
}

async function loadOrganizations() {
    $("#organization-table-container").innerHTML =
        '<p class="text-muted">Loading organizations...</p>';

    try {
        const data = await api.get("/admin/organizations");
        organizations = unwrapList(data, ["orgs"]).map((org) => ({
            ...org
        }));

        renderOrganizations();
    } catch (error) {
        $("#organization-table-container").innerHTML = "";
        showMessage(error.message);
    }
}

$("#show-create-organization").addEventListener("click", () => openForm());
$("#cancel-organization").addEventListener("click", closeForm);
$("#organization-search").addEventListener("input", renderOrganizations);

$("#organization-table-container").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-edit-organization]");
    if (!button) return;

    try {
        const id = button.dataset.editOrganization;
        const data = await api.get(`/admin/organizations/${encodeURIComponent(id)}`);
        openForm(data?.organization ?? data?.data ?? data);
    } catch (error) {
        showMessage(error.message);
    }
});

$("#organization-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const id = $("#organization-id").value;
    const payload = {
        name: $("#organization-name").value.trim(),
        contact_information: $("#contact-information").value.trim()
    };

    try {
        if (id) {
            await api.put(`/admin/organizations/${encodeURIComponent(id)}`, payload);
            showMessage("Organization updated successfully.", "success");
        } else {
            await api.post("/admin/organizations", payload);
            showMessage("Organization created successfully.", "success");
        }

        closeForm();
        await loadOrganizations();
    } catch (error) {
        showMessage(error.message);
    }
});

async function init() {
    try {
        const user = await getCurrentUser();

        if (!user) {
            window.location.assign("/login");
            return;
        }

        const admin = user.roles?.isAdmin === true ||
            user.roles?.is_admin === true;

        if (!admin) {
            window.location.assign("/engagements");
            return;
        }

        renderHeader({ user, activeTab: "administration" });
        await loadOrganizations();
    } catch (error) {
        showMessage(error.message);
    }
}

init();
