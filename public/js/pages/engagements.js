
import { getCurrentUser } from "../auth.js";
import { api } from "../api.js";
import { renderHeader } from "../layout.js";

const list = document.getElementById("engagement-list");
const userRoles = user => user?.roles ?? {};
const isAdmin = user => userRoles(user).isAdmin === true;

let currentUser = null;
let engagements = [];

function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function showMessage(message, type = "info") {
    let alert = document.getElementById("engagement-alert");

    if (!alert) {
        alert = document.createElement("div");
        alert.id = "engagement-alert";
        list.before(alert);
    }

    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    alert.hidden = false;
}

function clearMessage() {
    const alert = document.getElementById("engagement-alert");
    if (alert) alert.hidden = true;
}

function normalizeEngagements(data) {
    if (Array.isArray(data)) return data;

    // Support common API response wrappers.
    if (Array.isArray(data?.engagements)) return data.engagements;
    if (Array.isArray(data?.data)) return data.data;

    return [];
}

function engagementId(item) {
    return item.engagement_id ?? item.id;
}

function todayDateValue() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function dateInputValue(value) {
    if (!value) return "";

    const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);

    return match ? match[0] : "";
}

function renderCreateForm() {
    return `
    <section class="create-engagement-box">
    <button
    type="button"
    class="create-engagement-toggle"
    id="create-engagement-toggle"
    aria-expanded="false"
    aria-controls="create-engagement-form"
    >
    <span>Create Engagement</span>
    <span id="create-engagement-chevron" aria-hidden="true">+</span>
    </button>

        <form id="create-engagement-form" hidden>
        <div class="mb-3">
        <label for="engagement-name" class="form-label">
        Engagement Name
        </label>
        <input
        type="text"
        class="form-control"
        id="engagement-name"
        name="name"
        required
        >
        </div>

        <div class="mb-3">
        <label for="engagement-description" class="form-label">
        Description
        </label>
        <textarea
        class="form-control"
        id="engagement-description"
        name="description"
        rows="3"
        ></textarea>
        </div>

        <div class="row">
        <div class="col-md-6 mb-3">
        <label for="engagement-start-date" class="form-label">
        Start Date
        </label>
        <input
        type="date"
        class="form-control"
        id="engagement-start-date"
        name="start_date"
        value="${todayDateValue()}"
        required
        >
        </div>

        <div class="col-md-6 mb-3">
        <label for="engagement-end-date" class="form-label">
        End Date
        </label>
        <input
        type="date"
        class="form-control"
        id="engagement-end-date"
        name="end_date"
        >
        </div>
        </div>

        <div class="mb-3">
        <label for="engagement-status" class="form-label">
        Status
        </label>
        <select
        class="form-select"
        id="engagement-status"
        name="status"
        required
        >
        <option value="PLANNED" selected>Planned</option>
        <option value="ACTIVE">Active</option>
        <option value="COMPLETED">Completed</option>
        <option value="CANCELLED">Cancelled</option>
        </select>
        </div>

        <button
        id="create-engagement-button"
        type="submit"
        class="btn btn-success"
        >
        Create Engagement
        </button>
        </form>

    </section>
    `;
}

function renderEditForm() {
    return `
    <section class="create-engagement-box" id="edit-engagement-box" hidden>
    <div class="d-flex align-items-center justify-content-between mb-3">
    <h2 class="h5 mb-0">Edit Engagement</h2>
    <span class="text-muted small" id="edit-engagement-id-label"></span>
    </div>

        <form id="edit-engagement-form">
        <input type="hidden" id="edit-engagement-id" name="engagement_id">

        <div class="mb-3">
        <label for="edit-engagement-name" class="form-label">
        Engagement Name
        </label>
        <input
        type="text"
        class="form-control"
        id="edit-engagement-name"
        name="name"
        required
        >
        </div>

        <div class="mb-3">
        <label for="edit-engagement-description" class="form-label">
        Description
        </label>
        <textarea
        class="form-control"
        id="edit-engagement-description"
        name="description"
        rows="3"
        ></textarea>
        </div>

        <div class="row">
        <div class="col-md-6 mb-3">
        <label for="edit-engagement-start-date" class="form-label">
        Start Date
        </label>
        <input
        type="date"
        class="form-control"
        id="edit-engagement-start-date"
        name="start_date"
        required
        >
        </div>

        <div class="col-md-6 mb-3">
        <label for="edit-engagement-end-date" class="form-label">
        End Date
        </label>
        <input
        type="date"
        class="form-control"
        id="edit-engagement-end-date"
        name="end_date"
        >
        </div>
        </div>

        <div class="mb-3">
        <label for="edit-engagement-status" class="form-label">
        Status
        </label>
        <select
        class="form-select"
        id="edit-engagement-status"
        name="status"
        required
        >
        <option value="PLANNED">Planned</option>
        <option value="ACTIVE">Active</option>
        <option value="COMPLETED">Completed</option>
        <option value="CANCELLED">Cancelled</option>
        </select>
        </div>

        <div class="d-flex gap-2">
        <button
        id="edit-engagement-save"
        type="submit"
        class="btn btn-success"
        >
        Save Changes
        </button>
        <button
        id="edit-engagement-cancel"
        type="button"
        class="btn btn-outline-secondary"
        >
        Cancel
        </button>
        </div>
        </form>

    </section>
    `;
}

function renderList() {
    if (!engagements.length) {
        list.innerHTML = `
        <div class="empty-state">
        <h2 class="h5">No engagements yet</h2>
        <p class="text-muted mb-0">
        Engagements you can access will appear here.
        </p>
        </div>
        `;
        return;
    }

    list.innerHTML = `
    <div class="table-responsive">
    <table class="table align-middle">
    <thead>
    <tr>
    <th scope="col">Engagement</th>
    <th scope="col">Description</th>
    <th scope="col">Start Date</th>
    <th scope="col"><span class="visually-hidden">Actions</span></th>
    </tr>
    </thead>
    <tbody>
    ${engagements.map(item => {
        const id = engagementId(item);
        const name = item.name ?? item.engagement_name ?? "Untitled";
        const description = item.description ?? "—";
        const startDate = item.start_date
            ? new Date(item.start_date).toLocaleDateString()
            : "—";
        const actions = [];

        if (id != null) {
            actions.push(`
            <a
            class="btn btn-sm btn-outline-secondary"
            href="/engagements/${encodeURIComponent(id)}"
            >
            View
            </a>
            `);

            if (isAdmin(currentUser)) {
                actions.push(`
                <button
                type="button"
                class="btn btn-sm btn-outline-secondary"
                data-edit-engagement="${escapeHtml(id)}"
                >
                Edit
                </button>
                `);
            }
        }

        return `
        <tr>
        <td>
        <span class="fw-semibold">${escapeHtml(name)}</span>
        </td>
        <td>${escapeHtml(description)}</td>
        <td>${escapeHtml(startDate)}</td>
        <td class="text-end">
        <div class="d-flex justify-content-end gap-2">
        ${actions.join("")}
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

async function loadEngagements() {
    list.innerHTML = `<p class="text-muted">Loading engagements…</p>`;
    clearMessage();

    try {
        const data = await api.get("/engagements");
        engagements = normalizeEngagements(data);
        renderList();
    } catch (error) {
        list.innerHTML = "";
        showMessage(error.message || "Unable to load engagements.", "danger");
    }
}

async function createEngagement(event) {
    event.preventDefault();
    clearMessage();

    const form = event.currentTarget;
    const button = document.getElementById("create-engagement-button");
    const formData = new FormData(form);

    const payload = {
        name: document.getElementById("engagement-name").value.trim(),
        description: document.getElementById("engagement-description").value.trim(),
        start_date: document.getElementById("engagement-start-date").value,
        end_date: document.getElementById("engagement-end-date").value,
        status: document.getElementById("engagement-status").value
    };

    if (!payload.name) {
        showMessage("Enter an engagement name.", "warning");
        return;
    }

    button.disabled = true;
    button.textContent = "Creating…";

    try {
        await api.post("/engagements", payload);

        form.reset();
        document.getElementById("engagement-start-date").value = todayDateValue();
        showMessage("Engagement created successfully.", "success");
        await loadEngagements();
    } catch (error) {
        showMessage(error.message || "Unable to create engagement.", "danger");
    } finally {
        button.disabled = false;
        button.textContent = "Create engagement";
    }
}

function openEditForm(id) {
    const item = engagements.find(
        engagement => String(engagementId(engagement)) === String(id)
    );

    if (!item) return;

    const status = String(item.status ?? "PLANNED").toUpperCase();
    const statuses = ["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"];

    document.getElementById("edit-engagement-id").value = engagementId(item) ?? "";
    document.getElementById("edit-engagement-id-label").textContent =
        `#${engagementId(item)}`;
    document.getElementById("edit-engagement-name").value =
        item.name ?? item.engagement_name ?? "";
    document.getElementById("edit-engagement-description").value =
        item.description ?? "";
    document.getElementById("edit-engagement-start-date").value =
        dateInputValue(item.start_date);
    document.getElementById("edit-engagement-end-date").value =
        dateInputValue(item.end_date);
    document.getElementById("edit-engagement-status").value =
        statuses.includes(status) ? status : "PLANNED";

    const box = document.getElementById("edit-engagement-box");
    box.hidden = false;
    box.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("edit-engagement-name").focus({ preventScroll: true });
}

function closeEditForm() {
    const box = document.getElementById("edit-engagement-box");

    if (box) box.hidden = true;

    document.getElementById("edit-engagement-form")?.reset();
}

async function updateEngagement(event) {
    event.preventDefault();
    clearMessage();

    const id = document.getElementById("edit-engagement-id").value;
    const button = document.getElementById("edit-engagement-save");
    const payload = {
        name: document.getElementById("edit-engagement-name").value.trim(),
        description: document.getElementById("edit-engagement-description").value.trim(),
        start_date: document.getElementById("edit-engagement-start-date").value,
        end_date: document.getElementById("edit-engagement-end-date").value || null,
        status: document.getElementById("edit-engagement-status").value
    };

    if (!id) return;

    if (!payload.name) {
        showMessage("Enter an engagement name.", "warning");
        return;
    }

    button.disabled = true;
    button.textContent = "Saving…";

    try {
        await api.put(`/engagements/${encodeURIComponent(id)}`, payload);
        closeEditForm();
        await loadEngagements();
        showMessage("Engagement updated successfully.", "success");
    } catch (error) {
        showMessage(error.message || "Unable to update engagement.", "danger");
    } finally {
        button.disabled = false;
        button.textContent = "Save Changes";
    }
}

async function initialize() {
    if (!list) return;

    try {
        currentUser = await getCurrentUser();

        if (!currentUser) {
            window.location.href = "/login";
            return;
        }

        renderHeader({
            user: currentUser,
            activeTab: "engagements"
        });

        if (isAdmin(currentUser)) {
            list.insertAdjacentHTML(
                "beforebegin",
                renderCreateForm() + renderEditForm()
            );

            const createToggle = document.getElementById("create-engagement-toggle");
            const createForm = document.getElementById("create-engagement-form");
            const createChevron = document.getElementById("create-engagement-chevron");

            createToggle.addEventListener("click", () => {
                const expanded = createToggle.getAttribute("aria-expanded") === "true";

                createToggle.setAttribute("aria-expanded", String(!expanded));
                createForm.hidden = expanded;
                createChevron.textContent = expanded ? "+" : "−";
            });

            document
                .getElementById("create-engagement-form")
                ?.addEventListener("submit", async (event) => {
                    await createEngagement(event);

                    createToggle.setAttribute("aria-expanded", "false");
                    createForm.hidden = true;
                    createChevron.textContent = "+";
                });

            document
                .getElementById("edit-engagement-form")
                ?.addEventListener("submit", updateEngagement);

            document
                .getElementById("edit-engagement-cancel")
                ?.addEventListener("click", closeEditForm);

            list.addEventListener("click", (event) => {
                const button = event.target.closest("[data-edit-engagement]");

                if (button) {
                    openEditForm(button.dataset.editEngagement);
                }
            });
        }

        await loadEngagements();
    } catch (error) {
        list.innerHTML = "";
        showMessage(error.message || "Unable to initialize the engagements page.", "danger");
    }
}

initialize();
