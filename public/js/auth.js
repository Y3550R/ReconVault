import {
    api
} from "./api.js";
import {
    APP_PATH,
    LOGIN_PATH
} from "./config.js";
let currentUser = null;
export async function login(username, password) {
    const result = await api.post("/auth/login", {
        username,
        password
    });
    currentUser = result?.user || null;
    return result;
}
export async function getCurrentUser({
    force = false
} = {}) {
    if (currentUser && !force) return currentUser;
    const result = await api.get("/auth/me");
    currentUser = result?.user || null;
    return currentUser;
}
export function clearCurrentUser() {
    currentUser = null;
}
export async function logout() {
    try {
        await api.post("/auth/logout");
    } finally {
        clearCurrentUser();
        window.location.replace(LOGIN_PATH);
    }
}
export async function requireAuth() {
    try {
        const user = await getCurrentUser({
            force: true
        });
        if (!user) throw new Error("No active session");
        return user;
    } catch {
        clearCurrentUser();
        const dest = location.pathname + location.search + location.hash;
        location.replace(`${LOGIN_PATH}?returnTo=${encodeURIComponent(dest)}`);
        return null;
    }
}
export function redirectAfterLogin() {
    const dest = new URLSearchParams(location.search).get("returnTo");
    if (dest && dest.startsWith("/") && !dest.startsWith("//")) location.replace(dest);
        else location.replace(APP_PATH);
}
export function hasRole(user, role) {
    const roles = user?.roles;

    if (!roles) return false;

    // Handle boolean role flags:
    // { isAdmin: true, isPentester: false, isClient: false }
    if (!Array.isArray(roles) && typeof roles === "object") {
        const key = `is${String(role).charAt(0).toUpperCase()}${String(role).slice(1).toLowerCase()}`;
        return roles[key] === true;
    }

    // Handle role arrays if needed for compatibility
    if (Array.isArray(roles)) {
        return roles.some(
            r => String(r).toLowerCase() === String(role).toLowerCase()
        );
    }

    return false;
}
export function isAdmin(user) {
    return hasRole(user, "ADMIN");
}
export function isPentester(user) {
    return hasRole(user, "PENTESTER");
}
