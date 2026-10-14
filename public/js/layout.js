import { logout, isAdmin } from './auth.js';

const esc = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));

export function renderHeader({ user }) {
    const header = document.getElementById('app-header');

    if (!header) return;

    const username = user?.username || 'User';
    const admin = isAdmin(user);
    const isEngagements = window.location.pathname.startsWith("/engagements");
    const isUserManagement = window.location.pathname === "/admin/users";
    const isOrganizationManagement =
        window.location.pathname === "/admin/organizations";

    header.innerHTML = `
    <a class="brand-title" href="/">
    ReconVault
    </a>

    <div class="topbar-divider"></div>

    <nav class="topbar-tabs" aria-label="Main navigation">
    <a
    href="/engagements"
    class="topbar-tab ${isEngagements ? 'active' : ''}"
    >
    Engagements
    </a>

    ${admin ? `
        <a
        href="/admin/users"
        class="topbar-tab ${isUserManagement ? "active" : ""}"
        >
        Users
        </a>

        <a
        href="/admin/organizations"
        class="topbar-tab ${isOrganizationManagement ? "active" : ""}"
        >
        Organizations
        </a>
        ` : ""}
    </nav>

    <div class="profile-menu">
    <button
    type="button"
    class="profile-trigger"
    id="profile-trigger"
    aria-expanded="false"
    aria-controls="profile-dropdown"
    >
    <span class="profile-username">${esc(username)}</span>
    <span class="profile-avatar" aria-hidden="true"></span>
    <span class="profile-chevron" aria-hidden="true">⌄</span>
    </button>

    <div class="profile-dropdown" id="profile-dropdown" hidden>
    <button type="button" id="logout-button">
    Log out
    </button>
    </div>
    </div>
    `;

    const trigger = document.getElementById('profile-trigger');
    const dropdown = document.getElementById('profile-dropdown');
    const logoutButton = document.getElementById('logout-button');

    trigger.addEventListener('click', () => {
        const opening = dropdown.hidden;
        dropdown.hidden = !opening;
        trigger.setAttribute('aria-expanded', String(opening));
    });

    logoutButton.addEventListener('click', () => {
        logout();
    });

    // Close the dropdown when clicking outside the header.
    document.addEventListener('click', (event) => {
        if (!header.contains(event.target)) {
            dropdown.hidden = true;
            trigger.setAttribute('aria-expanded', 'false');
        }
    });
}
