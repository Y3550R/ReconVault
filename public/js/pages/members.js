
import { api } from "../api.js";
import { getCurrentUser, isAdmin } from "../auth.js";

const elements = {
    alert: document.querySelector("#members-alert"),

    membersCount: document.querySelector("#members-count"),
    membersContent: document.querySelector("#members-content"),
    addMemberForm: document.querySelector("#add-member-form"),
    memberUserId: document.querySelector("#member-user-id"),
    addMemberButton: document.querySelector("#add-member-button"),

    organizationsCount: document.querySelector("#organizations-count"),
    organizationsContent: document.querySelector("#organizations-content"),
    addOrganizationForm: document.querySelector("#add-organization-form"),
    organizationId: document.querySelector("#organization-id"),
    addOrganizationButton: document.querySelector("#add-organization-button"),
};

const engagementId = getEngagementId();

let members = [];
let organizations = [];
let canManage = false;
let loading = false;

function getEngagementId() {
    const match = window.location.pathname.match(/\/engagements\/(\d+)/);

    return match ? Number(match[1]) : null;
}

function escapeText(value) {
    return String(value ?? "");
}

function getDisplayName(record, fallback) {
    return (
        record.username ||
        record.name ||
        record.full_name ||
        record.organization_name ||
        record.company_name ||
        record.email ||
        `${fallback} #${record.user_id ?? record.organization_id ?? "Unknown"}`
    );
}

function getSecondaryText(record, type) {
    if (type === "member") {
        const parts = [];

        if (record.email) {
            parts.push(record.email);
        }

        if (record.user_id != null) {
            parts.push(`User ID: ${record.user_id}`);
        }

        return parts.join(" · ");
    }

    const parts = [];

    if (record.email) {
        parts.push(record.email);
    }

    if (record.organization_id != null) {
        parts.push(`Organization ID: ${record.organization_id}`);
    }

    return parts.join(" · ");
}

function showAlert(message, type = "danger") {
    elements.alert.textContent = message;
    elements.alert.className = `alert alert-${type}`;
    elements.alert.hidden = false;
    elements.alert.classList.remove("d-none");
}

function clearAlert() {
    elements.alert.textContent = "";
    elements.alert.classList.add("d-none");
    elements.alert.hidden = true;
}

function setLoadingState(isLoading) {
    loading = isLoading;

    elements.membersContent.setAttribute("aria-busy", String(isLoading));
    elements.organizationsContent.setAttribute("aria-busy", String(isLoading));

    elements.addMemberButton.disabled = isLoading || !canManage;
    elements.addOrganizationButton.disabled = isLoading || !canManage;
}

function createTextElement(tagName, className, text) {
    const element = document.createElement(tagName);

    if (className) {
        element.className = className;
    }

    element.textContent = escapeText(text);

    return element;
}

function createRecordRow(record, type) {
    const isMember = type === "member";
    const id = isMember ? record.user_id : record.organization_id;
    const name = getDisplayName(
        record,
        isMember ? "User" : "Organization"
    );

    const row = document.createElement("div");
    row.className = "member-record";

    const details = document.createElement("div");
    details.className = "member-record-details";

    details.append(
        createTextElement("h3", "member-record-name", name)
    );

    const secondary = getSecondaryText(record, type);

    if (secondary) {
        details.append(
            createTextElement("p", "member-record-meta", secondary)
        );
    }

    row.append(details);

    if (canManage) {
        const actions = document.createElement("div");
        actions.className = "member-record-actions";

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "btn btn-outline-danger btn-sm";
        removeButton.textContent = isMember ? "Remove member" : "Remove organization";
        removeButton.dataset.action = isMember ? "remove-member" : "remove-organization";
        removeButton.dataset.id = String(id);
        removeButton.disabled = loading || id == null;

        actions.append(removeButton);
        row.append(actions);
    }

    return row;
}

function renderRecords(container, records, type) {
    container.replaceChildren();

    if (!records.length) {
        const message = type === "member"
            ? "No pentesters have been assigned to this engagement."
            : "No client organizations are associated with this engagement.";

        container.append(
            createTextElement("p", "members-empty-state", message)
        );

        return;
    }

    const list = document.createElement("div");
    list.className = "member-record-list";

    for (const record of records) {
        list.append(createRecordRow(record, type));
    }

    container.append(list);
}

function renderMembers() {
    elements.membersCount.textContent =
        `${members.length} ${members.length === 1 ? "member" : "members"}`;

    renderRecords(elements.membersContent, members, "member");
}

function renderOrganizations() {
    elements.organizationsCount.textContent =
        `${organizations.length} ${organizations.length === 1 ? "organization" : "organizations"
        }`;

    renderRecords(elements.organizationsContent, organizations, "organization");
}

async function loadMembers() {
    const response = await api.get(`/engagements/${engagementId}/members`);

    members = response.members ?? [];
    renderMembers();
}

async function loadOrganizations() {
    const response = await api.get(`/engagements/${engagementId}/organizations`);

    organizations = response.organizations ?? [];
    renderOrganizations();
}

async function loadPage() {
    if (!engagementId) {
        showAlert("Invalid engagement ID in the page URL.");
        elements.membersContent.replaceChildren(
            createTextElement("p", "members-empty-state", "Unable to load members.")
        );
        elements.organizationsContent.replaceChildren(
            createTextElement("p", "members-empty-state", "Unable to load organizations.")
        );
        return;
    }

    clearAlert();
    setLoadingState(true);

    try {
        await Promise.all([
            loadMembers(),
            loadOrganizations(),
        ]);
    } catch (error) {
        showAlert(error.message || "Failed to load engagement members.");
    } finally {
        setLoadingState(false);
        renderMembers();
        renderOrganizations();
    }
}

async function handleAddMember(event) {
    event.preventDefault();

    if (!canManage || loading) {
        return;
    }

    const userId = Number(elements.memberUserId.value);

    if (!Number.isSafeInteger(userId) || userId < 1) {
        showAlert("Enter a valid user ID.");
        return;
    }

    clearAlert();
    setLoadingState(true);

    try {
        await api.post(`/engagements/${engagementId}/members`, {
            user_id: userId,
        });

        elements.addMemberForm.reset();

        await loadMembers();
        showAlert("Pentester added successfully.", "success");
    } catch (error) {
        showAlert(error.message || "Failed to add pentester.");
    } finally {
        setLoadingState(false);
        renderMembers();
    }
}

async function handleAddOrganization(event) {
    event.preventDefault();

    if (!canManage || loading) {
        return;
    }

    const organizationId = Number(elements.organizationId.value);

    if (!Number.isSafeInteger(organizationId) || organizationId < 1) {
        showAlert("Enter a valid organization ID.");
        return;
    }

    clearAlert();
    setLoadingState(true);

    try {
        await api.post(`/engagements/${engagementId}/organizations`, {
            organization_id: organizationId,
        });

        elements.addOrganizationForm.reset();

        await loadOrganizations();
        showAlert("Client organization added successfully.", "success");
    } catch (error) {
        showAlert(error.message || "Failed to add client organization.");
    } finally {
        setLoadingState(false);
        renderOrganizations();
    }
}

async function handleRemoveMember(userId) {
    if (!canManage || loading) {
        return;
    }

    const member = members.find(
        (item) => Number(item.user_id) === Number(userId)
    );

    const name = member
        ? getDisplayName(member, "User")
        : `User #${userId}`;

    if (!window.confirm(`Remove ${name} from this engagement?`)) {
        return;
    }

    clearAlert();
    setLoadingState(true);

    try {
        await api.delete(
            `/engagements/${engagementId}/members/${encodeURIComponent(userId)}`
        );

        await loadMembers();
        showAlert("Pentester removed successfully.", "success");
    } catch (error) {
        showAlert(error.message || "Failed to remove pentester.");
    } finally {
        setLoadingState(false);
        renderMembers();
    }
}

async function handleRemoveOrganization(organizationId) {
    if (!canManage || loading) {
        return;
    }

    const organization = organizations.find(
        (item) => Number(item.organization_id) === Number(organizationId)
    );

    const name = organization
        ? getDisplayName(organization, "Organization")
        : `Organization #${organizationId}`;

    if (!window.confirm(`Remove ${name} from this engagement?`)) {
        return;
    }

    clearAlert();
    setLoadingState(true);

    try {
        await api.delete(
            `/engagements/${engagementId}/organizations/${encodeURIComponent(organizationId)}`
        );

        await loadOrganizations();
        showAlert("Client organization removed successfully.", "success");
    } catch (error) {
        showAlert(error.message || "Failed to remove client organization.");
    } finally {
        setLoadingState(false);
        renderOrganizations();
    }
}

function handleListAction(event) {
    const button = event.target.closest("button[data-action]");

    if (!button || loading) {
        return;
    }

    const id = Number(button.dataset.id);

    if (!Number.isSafeInteger(id) || id < 1) {
        showAlert("Invalid record ID.");
        return;
    }

    if (button.dataset.action === "remove-member") {
        void handleRemoveMember(id);
    }

    if (button.dataset.action === "remove-organization") {
        void handleRemoveOrganization(id);
    }
}

async function initialize() {
    try {
        const user = await getCurrentUser();
        canManage = Boolean(user && isAdmin(user));

        if (!canManage) {
            elements.addMemberForm.hidden = true;
            elements.addOrganizationForm.hidden = true;
        }

        await loadPage();
    } catch (error) {
        showAlert(error.message || "Failed to initialize engagement members.");
    }
}

elements.addMemberForm.addEventListener("submit", handleAddMember);
elements.addOrganizationForm.addEventListener("submit", handleAddOrganization);

elements.membersContent.addEventListener("click", handleListAction);
elements.organizationsContent.addEventListener("click", handleListAction);

void initialize();
