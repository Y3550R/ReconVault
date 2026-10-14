import { getCurrentUser } from "../auth.js";
import { renderHeader } from "../layout.js";
import { api } from "../api.js";

const $ = (selector) => document.querySelector(selector);

const ALL_ROLES = ["admin", "pentester", "client"];

const ROLE_LABELS = {
    admin: "Administrator",
    pentester: "Pentester",
    client: "Client"
};

let users = [];
let organizations = [];

const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[char]));

function unwrapList(data, keys = []) {
    if (Array.isArray(data)) return data;

    for (const key of keys) {
        if (Array.isArray(data?.[key])) return data[key];
    }

    if (Array.isArray(data?.data)) return data.data;
    return [];
}

function unwrapObject(data, key) {
    return data?.[key] ?? data?.data ?? data;
}

function userId(user) {
    return user?.user_id ?? user?.id;
}

function organizationId(organization) {
    return organization?.organization_id ?? organization?.id;
}

function getRoleNames(roles) {
    if (!Array.isArray(roles)) return [];

    return [...new Set(
        roles
            .map((role) =>
                typeof role === "string" ? role : role?.role ?? role?.name
            )
            .filter((role) => ALL_ROLES.includes(role))
    )];
}

function showMessage(
    message,
    type = "danger",
    target = "#user-message"
) {
    const element = $(target);
    if (!element) return;

    element.innerHTML = message
        ? `<div class="alert alert-${type}" role="alert">${esc(message)}</div>`
        : "";
}

function selectedFormRoles() {
    return [...document.querySelectorAll(".user-role-checkbox:checked")]
        .map((input) => input.value);
}

function updateOrganizationVisibility() {
    const isClient = selectedFormRoles().includes("client");

    $("#user-organization-section").hidden = !isClient;

    if (!isClient) {
        $("#organization-select").value = "";
        $("#organization-error").textContent = "";
    }
}

function setFormRoles(roles = []) {
    const assignedRoles = new Set(getRoleNames(roles));

    document.querySelectorAll(".user-role-checkbox").forEach((input) => {
        input.checked = assignedRoles.has(input.value);
    });

    $("#user-roles-error").textContent = "";
    updateOrganizationVisibility();
}

function setFormOrganization(assignedOrganizationId = "") {
    $("#organization-select").value =
        assignedOrganizationId == null ? "" : String(assignedOrganizationId);
}

function openUserForm(user = null) {
    $("#user-form").reset();

    $("#user-id").value = user ? userId(user) : "";
    $("#username").value = user?.username ?? "";
    $("#user-status").value = user?.status ?? "ACTIVE";

    $("#password").required = !user;
    $("#password").value = "";

    $("#user-form-message").innerHTML = "";
    $("#user-roles-error").textContent = "";
    $("#organization-error").textContent = "";

    setFormRoles(user?.roles ?? []);

    setFormOrganization(
        user?.client_organization_id ??
        user?.organization?.client_organization_id ??
        user?.organization?.organization_id ??
        user?.organization?.id ??
        ""
    );

    updateOrganizationVisibility();

    $("#user-form-title").textContent = user ? "Edit User" : "Create User";
    $("#save-user").textContent = user ? "Save Changes" : "Create User";
    $("#user-form-panel").hidden = false;

    $("#user-form-panel").scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

function closeUserForm() {
    $("#user-form-panel").hidden = true;
    $("#user-form").reset();
    $("#user-form-message").innerHTML = "";
    $("#user-roles-error").textContent = "";
    $("#organization-error").textContent = "";
}

function renderRoleLabels(roles) {
    const names = getRoleNames(roles);

    if (!names.length) {
        return '<span class="text-muted">—</span>';
    }

    return names
        .map((role) =>
            `<span class="status-pill">${esc(ROLE_LABELS[role] ?? role)}</span>`
        )
        .join(" ");
}

function renderUsers() {
    const search = $("#user-search").value.trim().toLowerCase();

    const filtered = users.filter((user) =>
        String(user.username ?? "").toLowerCase().includes(search)
    );

    if (!filtered.length) {
        $("#user-table-container").innerHTML = `
        <div class="empty-state">
        <h3 class="h6">No users found</h3>
        <p class="text-muted mb-0">
        Try a different search or create a user.
        </p>
        </div>`;
        return;
    }

    $("#user-table-container").innerHTML = `
    <div class="table-responsive">
    <table class="table align-middle">
    <thead>
    <tr>
    <th>Username</th>
    <th>Status</th>
    <th>Roles</th>
    <th>User ID</th>
    <th class="text-end">Actions</th>
    </tr>
    </thead>
    <tbody>
    ${filtered.map((user) => `
        <tr>
        <td class="fw-semibold">${esc(user.username)}</td>
        <td>${esc(user.status ?? "—")}</td>
        <td>${renderRoleLabels(user.roles)}</td>
        <td>${esc(userId(user) ?? "—")}</td>
        <td class="text-end">
        <button
        type="button"
        class="btn btn-sm btn-outline-secondary"
        data-edit-user="${esc(userId(user))}">
        Edit
        </button>
        </td>
        </tr>
        `).join("")}
        </tbody>
        </table>
        </div>`;
}

async function fetchUserRoles(id) {
    const data = await api.get(`/admin/users/${encodeURIComponent(id)}/roles`);

    return Object.entries(data.roles)
        .filter(([_, enabled]) => enabled)
        .map(([role]) => role.replace("is_", ""));
}

async function fetchUserOrganization(id) {
    const data = await api.get(
        `/admin/users/${encodeURIComponent(id)}/organization`
    );

    return data.organization_id ??
        "";
}

async function loadUsers() {
    $("#user-table-container").innerHTML =
        '<p class="text-muted">Loading users...</p>';

    try {
        const data = await api.get("/admin/users");

        users = unwrapList(data, ["users"]).map((user) => ({
            ...user,
            roles: Object.entries(user)
            .filter(([key, value]) => key.startsWith("is_") && value)
            .map(([key]) => key.replace("is_", ""))
        }));

        renderUsers();
        showMessage("");
    } catch (error) {
        $("#user-table-container").innerHTML = "";
        showMessage(error.message);
    }
}

async function loadOrganizations() {
    const data = await api.get("/admin/organizations");

    organizations = unwrapList(data, ["orgs"]);

    $("#organization-select").innerHTML = `
    <option value="">Select organization</option>
    ${organizations.map((organization) => `
        <option value="${esc(organizationId(organization))}">
        ${esc(organization.name)}
        </option>
        `).join("")}`;
}

async function loadUserForEditing(id) {
    const [userData, roles, assignedOrganizationId] = await Promise.all([
        api.get(`/admin/users/${encodeURIComponent(id)}`),
        fetchUserRoles(id),
        fetchUserOrganization(id).catch(() => "")
    ]);

    const user = unwrapObject(userData, "user");

    return {
        ...user,
        roles,
        client_organization_id: assignedOrganizationId
    };
}

$("#show-create-user").addEventListener("click", () => openUserForm());

$("#cancel-user").addEventListener("click", closeUserForm);

$("#user-search").addEventListener("input", renderUsers);

document.querySelectorAll(".user-role-checkbox").forEach((input) => {
    input.addEventListener("change", updateOrganizationVisibility);
});

$("#user-table-container").addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-user]");
    if (!editButton) return;

    editButton.disabled = true;

    try {
        const user = await loadUserForEditing(editButton.dataset.editUser);
        openUserForm(user);
    } catch (error) {
        showMessage(error.message);
    } finally {
        editButton.disabled = false;
    }
});

$("#user-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    showMessage("", "danger", "#user-form-message");
    $("#user-roles-error").textContent = "";
    $("#organization-error").textContent = "";

    const id = $("#user-id").value;
    const roles = selectedFormRoles();
    const isClient = roles.includes("client");

    if (roles.length === 0) {
        $("#user-roles-error").textContent =
            "A user must have at least one role.";
        return;
    }

    const payload = {
        username: $("#username").value.trim(),
        status: $("#user-status").value,
        roles
    };

    if ($("#password").value) {
        payload.password = $("#password").value;
    }

    if (!id && !payload.password) {
        showMessage(
            "Password is required when creating a user.",
            "danger",
            "#user-form-message"
        );
        return;
    }

    const saveButton = $("#save-user");
    saveButton.disabled = true;

    try {
        let savedId = id;

        if (id) {
            await api.put(`/admin/users/${encodeURIComponent(id)}`, payload);
        } else {
            const createdData = await api.post("/admin/users", payload);

            const createdUser = unwrapObject(createdData, "user");
            savedId = userId(createdUser) ?? "";
        }

        const organizationValue = $("#organization-select").value;

        if (isClient && organizationValue && savedId) {
            await api.put(
                `/admin/users/${encodeURIComponent(savedId)}/organization`,
                {
                    client_organization_id: Number(organizationValue)
                }
            );
        }

        closeUserForm();

        showMessage(
            id ? "User updated successfully." : "User created successfully.",
            "success"
        );

        await loadUsers();
    } catch (error) {
        showMessage(error.message, "danger", "#user-form-message");
    } finally {
        saveButton.disabled = false;
    }
});

async function init() {
    try {
        const user = await getCurrentUser();

        if (!user) {
            window.location.assign("/login");
            return;
        }

        const isAdmin =
            user.roles?.isAdmin === true ||
            user.roles?.is_admin === true;

        if (!isAdmin) {
            window.location.assign("/engagements");
            return;
        }

        renderHeader({
            user,
            activeTab: "administration"
        });

        const results = await Promise.allSettled([
            loadOrganizations(),
            loadUsers()
        ]);

        if (results[0].status === "rejected") {
            showMessage(
                results[0].reason?.message ?? "Failed to load organizations."
            );
        }
    } catch (error) {
        showMessage(error.message);
    }
}

init();
