import { io } from "socket.io-client";
import type { Socket as IoSocket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "@direct-to-video/shared";

export const socket: IoSocket<ServerToClientEvents, ClientToServerEvents> = io({
  autoConnect: false,
});

export type Socket = typeof socket;
