
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

        return `
        <tr>
        <td>
        <span class="fw-semibold">${escapeHtml(name)}</span>
        </td>
        <td>${escapeHtml(description)}</td>
        <td>${escapeHtml(startDate)}</td>
        <td class="text-end">
        ${id != null ? `
            <a
            class="btn btn-sm btn-outline-secondary"
            href="/engagements/${encodeURIComponent(id)}"
            >
            View
            </a>
            ` : ""}
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
        showMessage("Engagement created successfully.", "success");
        await loadEngagements();
    } catch (error) {
        showMessage(error.message || "Unable to create engagement.", "danger");
    } finally {
        button.disabled = false;
        button.textContent = "Create engagement";
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
            list.insertAdjacentHTML("beforebegin", renderCreateForm());

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
        }

        await loadEngagements();
    } catch (error) {
        list.innerHTML = "";
        showMessage(error.message || "Unable to initialize the engagements page.", "danger");
    }
}

initialize();
