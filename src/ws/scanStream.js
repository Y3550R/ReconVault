import { WebSocketServer, WebSocket } from "ws";
import { parse as parseCookie } from "cookie";
import cookieSignature from "cookie-signature";
import { config } from "../config/index.js";
import { sessionStore } from "../app.js";
import { query } from "../db.js";
import { scanEvents } from "../services/scanEvents.js";

const WS_PATH = "/ws/scans";
const HEARTBEAT_INTERVAL_MS = 30000;

function rejectUpgrade(socket, statusCode, statusText) {
  if (!socket.destroyed) {
    socket.write(
      `HTTP/1.1 ${statusCode} ${statusText}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`
    );
    socket.destroy();
  }
}

function getSessionId(request) {
  const cookies = parseCookie(request.headers.cookie || "");
  const rawValue = cookies[config.session.name];

  if (!rawValue) return null;

  if (rawValue.startsWith("s:")) {
    return cookieSignature.unsign(rawValue.slice(2), config.session.secret) || null;
  }

  return rawValue;
}

function readSession(sessionId) {
  return new Promise((resolve, reject) => {
    sessionStore.get(sessionId, (error, session) => {
      if (error) reject(error);
      else resolve(session ?? null);
    });
  });
}

async function canAccessEngagement(user, engagementId) {
  if (!user?.roles) return false;

  if (user.roles.isAdmin) {
    const engagement = await query(
      "SELECT 1 FROM engagements WHERE engagement_id = ?",
      [engagementId]
    );

    return engagement.length > 0;
  }

  if (user.roles.isPentester) {
    const membership = await query(
      `SELECT 1 FROM engagement_members
      WHERE engagement_id = ? AND user_id = ?`,
      [engagementId, user.user_id]
    );

    return membership.length > 0;
  }

  if (user.roles.isClient && user.clientOrganizationId) {
    const association = await query(
      `SELECT 1 FROM engagement_organizations
      WHERE engagement_id = ? AND organization_id = ?`,
      [engagementId, user.clientOrganizationId]
    );

    return association.length > 0;
  }

  return false;
}

export function attachScanWebSocket(server) {
  const clients = new Map();
  const wss = new WebSocketServer({ noServer: true });

  function broadcast(engagementId, payload, { scanId = null } = {}) {
    const message = JSON.stringify(payload);

    for (const [socket, client] of clients) {
      if (
        client.engagementId === engagementId &&
        socket.readyState === WebSocket.OPEN &&
        (scanId == null || client.scanId === scanId)
      ) {
        socket.send(message);
      }
    }
  }

  server.on("upgrade", (request, socket, head) => {
    let url;

    try {
      url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    } catch {
      rejectUpgrade(socket, 400, "Bad Request");
      return;
    }

    if (url.pathname !== WS_PATH) {
      rejectUpgrade(socket, 404, "Not Found");
      return;
    }

    const engagementId = Number(url.searchParams.get("engagementId"));

    if (!Number.isSafeInteger(engagementId) || engagementId < 1) {
      rejectUpgrade(socket, 400, "Bad Request");
      return;
    }

    const sessionId = getSessionId(request);

    if (!sessionId) {
      rejectUpgrade(socket, 401, "Unauthorized");
      return;
    }

    readSession(sessionId)
      .then(async (session) => {
        if (!session?.user) {
          rejectUpgrade(socket, 401, "Unauthorized");
          return;
        }

        if (!(await canAccessEngagement(session.user, engagementId))) {
          rejectUpgrade(socket, 403, "Forbidden");
          return;
        }

        if (socket.destroyed) return;

        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request, {
            engagementId,
            user: session.user,
          });
        });
      })
      .catch((error) => {
        console.error("Failed to authenticate scan WebSocket:", error);
        rejectUpgrade(socket, 401, "Unauthorized");
      });
  });

  wss.on("connection", (ws, request, context) => {
    context.scanId = null;
    clients.set(ws, context);
    ws.isAlive = true;

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", (data) => {
      let message;

      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (message?.type === "subscribe") {
        const scanId = Number(message.scanId);

        if (Number.isSafeInteger(scanId) && scanId > 0) {
          context.scanId = scanId;
        }
      } else if (message?.type === "unsubscribe") {
        context.scanId = null;
      }
    });

    ws.on("close", () => clients.delete(ws));
    ws.on("error", () => clients.delete(ws));

    ws.send(
      JSON.stringify({
        type: "connected",
        engagementId: context.engagementId,
      })
    );
  });

  const heartbeat = setInterval(() => {
    for (const socket of clients.keys()) {
      if (socket.isAlive === false) {
        clients.delete(socket);
        socket.terminate();
        continue;
      }

      socket.isAlive = false;
      socket.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  scanEvents.on("scan:output", (event) => {
    broadcast(event.engagementId, {
      type: "scan.output",
      scanId: event.scanId,
      stream: event.stream,
      chunk: event.chunk,
    }, { scanId: event.scanId });
  });

  scanEvents.on("scan:status", (event) => {
    broadcast(event.engagementId, {
      type: "scan.status",
      scanId: event.scanId,
      status: event.status,
      errorMessage: event.errorMessage ?? null,
    });
  });

  scanEvents.on("scans:changed", (event) => {
    broadcast(event.engagementId, {
      type: "scans.changed",
      scanId: event.scanId ?? null,
    });
  });

  function close() {
    clearInterval(heartbeat);

    for (const socket of clients.keys()) {
      socket.terminate();
    }

    clients.clear();
    wss.close();
  }

  return { wss, close };
}
