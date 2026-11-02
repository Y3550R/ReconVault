import { EventEmitter } from "node:events";

// Central event bus for scan lifecycle updates. The WebSocket layer listens
// here so the executor stays independent from transport concerns.
export const scanEvents = new EventEmitter();

scanEvents.setMaxListeners(100);
