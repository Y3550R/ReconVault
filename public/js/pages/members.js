
import { api } from "../api.js";
import { getCurrentUser, isAdmin } from "../auth.js";

const elements = {
    alert: document.querySelector("#members-alert"),

    membersCount: document.querySelector("#members-count"),
    membersContent: document.querySelector("#members-content"),
    addMemberForm: document.querySelector("#add-member-form"),
    memberUserSearch: document.querySelector("#member-user-search"),
    memberUserId: document.querySelector("#member-user-id"),
    addMemberButton: document.querySelector("#add-member-button"),

    organizationsCount: document.querySelector("#organizations-count"),
    organizationsContent: document.querySelector("#organizations-content"),
    addOrganizationForm: document.querySelector("#add-organization-form"),
    organizationSearch: document.querySelector("#organization-search"),
    organizationId: document.querySelector("#organization-id"),
    addOrganizationButton: document.querySelector("#add-organization-button"),
};

const engagementId = getEngagementId();

let members = [];
let organizations = [];
let users = [];
let organizationDirectory = [];
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

function describeUser(user) {
    const roles = [];

    if (Number(user.is_admin)) roles.push("Admin");
    if (Number(user.is_pentester)) roles.push("Pentester");
    if (Number(user.is_client)) roles.push("Client");

    const parts = [];

    if (roles.length) {
        parts.push(roles.join(" / "));
    }

    if (user.status && user.status !== "ACTIVE") {
        parts.push(user.status);
    }

    return parts.join(" · ");
}

function getUserItems() {
    const assigned = new Set(members.map((member) => Number(member.user_id)));

    return users
        .filter((user) => !assigned.has(Number(user.user_id)))
        .map((user) => {
            const label = user.username ?? `User #${user.user_id}`;
            const meta = describeUser(user);

            return {
                id: user.user_id,
                label,
                meta,
                searchText: `${label} ${meta}`.toLowerCase(),
            };
        })
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

function getOrganizationItems() {
    const assigned = new Set(
        organizations.map((organization) => Number(organization.organization_id))
    );

    return organizationDirectory
        .filter((organization) => !assigned.has(Number(organization.organization_id)))
        .map((organization) => {
            const label = organization.name ?? `Organization #${organization.organization_id}`;
            const meta = organization.contact_information ?? "";

            return {
                id: organization.organization_id,
                label,
                meta,
                searchText: `${label} ${meta}`.toLowerCase(),
            };
        })
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

function createCombobox({ input, hidden, list, getItems }) {
    let visible = [];
    let activeIndex = -1;

    function setActive(index) {
        activeIndex = index;

        const options = [...list.querySelectorAll(".combobox-option")];

        options.forEach((option, optionIndex) => {
            option.classList.toggle("is-active", optionIndex === index);
        });

        const active = options[index];

        if (active) {
            input.setAttribute("aria-activedescendant", active.id);
        } else {
            input.removeAttribute("aria-activedescendant");
        }
    }

    function build(query = "") {
        const items = getItems();
        const needle = query.trim().toLowerCase();

        visible = needle
            ? items.filter((item) => item.searchText.includes(needle))
            : items;

        list.replaceChildren();

        if (!visible.length) {
            const empty = document.createElement("li");
            empty.className = "combobox-empty";
            empty.textContent = items.length
                ? "No matching results."
                : "Nothing available to add.";
            list.append(empty);
        } else {
            visible.forEach((item, index) => {
                const option = document.createElement("li");
                option.id = `${list.id}-option-${index}`;
                option.className = "combobox-option";
                option.dataset.id = String(item.id);
                option.setAttribute("role", "option");
                option.setAttribute(
                    "aria-selected",
                    String(String(item.id) === hidden.value)
                );

                const label = document.createElement("span");
                label.className = "combobox-label";
                label.textContent = item.label;
                option.append(label);

                if (item.meta) {
                    const meta = document.createElement("span");
                    meta.className = "combobox-meta";
                    meta.textContent = item.meta;
                    option.append(meta);
                }

                list.append(option);
            });
        }

        activeIndex = -1;
        input.removeAttribute("aria-activedescendant");
        list.hidden = false;
        input.setAttribute("aria-expanded", "true");
    }

    function close() {
        list.hidden = true;
        activeIndex = -1;
        input.setAttribute("aria-expanded", "false");
        input.removeAttribute("aria-activedescendant");
    }

    function select(item) {
        hidden.value = String(item.id);
        input.value = item.label;
        close();
    }

    input.addEventListener("focus", () => build(""));
    input.addEventListener("click", () => {
        if (list.hidden) build("");
    });
    input.addEventListener("input", () => {
        hidden.value = "";
        build(input.value);
    });
    input.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();

            if (list.hidden) build(input.value);
            if (!visible.length) return;

            const delta = event.key === "ArrowDown" ? 1 : -1;
            let next = activeIndex + delta;

            if (next < 0) next = visible.length - 1;
            if (next >= visible.length) next = 0;

            setActive(next);
        } else if (event.key === "Enter") {
            if (!list.hidden && activeIndex >= 0) {
                event.preventDefault();
                select(visible[activeIndex]);
            } else if (!list.hidden) {
                const exact = visible.find(
                    (item) => item.label.toLowerCase() === input.value.trim().toLowerCase()
                );
                const match = exact ?? (visible.length === 1 ? visible[0] : null);

                if (match) {
                    event.preventDefault();
                    select(match);
                }
            }
        } else if (event.key === "Escape") {
            close();
        }
    });
    input.addEventListener("blur", () => close());
    list.addEventListener("pointerdown", (event) => event.preventDefault());
    list.addEventListener("mousedown", (event) => event.preventDefault());
    list.addEventListener("click", (event) => {
        const option = event.target.closest(".combobox-option");

        if (!option) return;

        const item = visible.find(
            (entry) => String(entry.id) === option.dataset.id
        );

        if (item) {
            select(item);
        }
    });
    document.addEventListener("click", (event) => {
        if (!list.hidden && !input.parentElement.contains(event.target)) {
            close();
        }
    });

    return {
        close,
        reset() {
            hidden.value = "";
            input.value = "";
            close();
        },
    };
}

const userCombobox = createCombobox({
    input: elements.memberUserSearch,
    hidden: elements.memberUserId,
    list: document.querySelector("#member-user-options"),
    getItems: getUserItems,
});

const organizationCombobox = createCombobox({
    input: elements.organizationSearch,
    hidden: elements.organizationId,
    list: document.querySelector("#organization-options"),
    getItems: getOrganizationItems,
});

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
            createTextElement("p", "empty-state", message)
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

async function loadUserDirectory() {
    const response = await api.get("/admin/users");

    users = Array.isArray(response?.users) ? response.users : [];
}

async function loadOrganizationDirectory() {
    const response = await api.get("/admin/organizations");

    organizationDirectory = Array.isArray(response?.orgs) ? response.orgs : [];
}

async function loadPage() {
    if (!engagementId) {
        showAlert("Invalid engagement ID in the page URL.");
        elements.membersContent.replaceChildren(
            createTextElement("p", "empty-state", "Unable to load members.")
        );
        elements.organizationsContent.replaceChildren(
            createTextElement("p", "empty-state", "Unable to load organizations.")
        );
        return;
    }

    clearAlert();
    setLoadingState(true);

    try {
        const tasks = [
            loadMembers(),
            loadOrganizations(),
        ];

        if (canManage) {
            tasks.push(loadUserDirectory(), loadOrganizationDirectory());
        }

        const results = await Promise.allSettled(tasks);
        const failure = results.find((result) => result.status === "rejected");

        if (failure) {
            throw failure.reason;
        }
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
        showAlert("Select a user from the list.");
        elements.memberUserSearch.focus();
        return;
    }

    clearAlert();
    setLoadingState(true);

    try {
        await api.post(`/engagements/${engagementId}/members`, {
            user_id: userId,
        });

        elements.addMemberForm.reset();
        userCombobox.reset();

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
        showAlert("Select a client organization from the list.");
        elements.organizationSearch.focus();
        return;
    }

    clearAlert();
    setLoadingState(true);

    try {
        await api.post(`/engagements/${engagementId}/organizations`, {
            organization_id: organizationId,
        });

        elements.addOrganizationForm.reset();
        organizationCombobox.reset();

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
