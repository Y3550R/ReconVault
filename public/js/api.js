import {
    API_BASE_URL,
    REQUEST_TIMEOUT_MS
} from "./config.js";
export class ApiError extends Error {
    constructor(message, status = 0, data = null) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.data = data;
    }
}
async function request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const headers = new Headers(options.headers || {});
    const hasBody = options.body !== undefined && options.body !== null;
    if (hasBody && !(options.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    headers.set("Accept", "application/json");
    try {
        const response = await fetch(`${API_BASE_URL}${path}`, {
            ...options,
            headers,
            credentials: "include",
            signal: options.signal || controller.signal
        });
        const type = response.headers.get("content-type") || "";
        let data = null;
        if (response.status !== 204) {
            if (type.includes("application/json")) data = await response.json().catch(() => null);
            else {
                const t = await response.text().catch(() => "");
                data = t ? {
                    message: t
                } : null;
            }
        }
        if (!response.ok) {
            const rawMessage = data?.message ?? data?.error;

            const message =
                typeof rawMessage === "string"
                    ? rawMessage
                    : typeof rawMessage?.message === "string"
                        ? rawMessage.message
                        : typeof rawMessage?.error === "string"
                            ? rawMessage.error
                            : `Request failed (${response.status})`;

            throw new ApiError(message, response.status, data);
        }
        return data;
    } catch (error) {
        if (error instanceof ApiError) throw error;
        if (error.name === "AbortError") throw new ApiError("The request timed out. Please try again.");
        throw new ApiError("Unable to reach the ReconVault server. Check the backend connection.");
    } finally {
        clearTimeout(timer);
    }
}
export const api = {
    get: (p, o = {}) => request(p, {
        ...o,
        method: "GET"
    }),
    post: (p, b, o = {}) => request(p, {
        ...o,
        method: "POST",
        ...(b === undefined ? {} : {
            body: JSON.stringify(b)
        })
    }),
    put: (p, b, o = {}) => request(p, {
        ...o,
        method: "PUT",
        ...(b === undefined ? {} : {
            body: JSON.stringify(b)
        })
    }),
    patch: (p, b, o = {}) => request(p, {
        ...o,
        method: "PATCH",
        ...(b === undefined ? {} : {
            body: JSON.stringify(b)
        })
    }),
    delete: (p, o = {}) => request(p, {
        ...o,
        method: "DELETE"
    })
};
