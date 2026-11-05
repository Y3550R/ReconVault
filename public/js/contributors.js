function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    })[char]);
}

export function contributorLabel(contributor) {
    if (!contributor || typeof contributor !== "object") {
        return "Unknown contributor";
    }

    if (contributor.contributor_type === "SCAN") {
        return contributor.scan_id != null
            ? `Scan #${contributor.scan_id}`
            : "Scan";
    }

    return contributor.username
        || (contributor.user_id != null ? `User #${contributor.user_id}` : "Pentester");
}

function contributorTitle(contributor) {
    if (contributor.contributor_type === "SCAN") {
        const details = ["Scan contributor"];

        if (contributor.scan_type) details.push(contributor.scan_type);
        if (contributor.scan_status) details.push(contributor.scan_status);

        return details.join(" · ");
    }

    return "Pentester contributor";
}

/**
 * Render a compact list of contributor chips.
 *
 * @param {Array<object>} contributors
 * @param {string} emptyLabel Text to show when no contributors are recorded.
 */
export function renderContributors(contributors, emptyLabel = "—") {
    const list = (Array.isArray(contributors) ? contributors : [])
        .filter((contributor) => {
            if (!contributor || typeof contributor !== "object") {
                return false;
            }

            if (contributor.contributor_type === "SCAN") {
                return contributor.scan_id != null;
            }

            return contributor.contributor_type === "PENTESTER"
                && (contributor.user_id != null || Boolean(contributor.username));
        });

    if (!list.length) {
        return `<span class="contributor-empty">${escapeHtml(emptyLabel)}</span>`;
    }

    return `
    <span class="contributor-list">
        ${list.map((contributor) => {
            const type = contributor.contributor_type === "SCAN"
                ? "scan"
                : "pentester";
            const label = contributorLabel(contributor);
            const title = contributorTitle(contributor);

            return `
            <span class="contributor-chip contributor-chip--${type}"
                title="${escapeHtml(title)}"
                aria-label="${escapeHtml(`${title}: ${label}`)}">
                ${escapeHtml(label)}
            </span>
            `;
        }).join("")}
    </span>
    `;
}
