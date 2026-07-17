import type { Socket } from "socket.io";

const MAX_CONNECTIONS_PER_IP = 1000;
const MAX_JOIN_ATTEMPTS_PER_IP = 200;
const JOIN_WINDOW_MS = 60 * 1000;
const SOCKET_EVENT_WINDOW_MS = 10 * 1000;
const MAX_SOCKET_EVENTS = 50;

const connectionsPerIp = new Map<string, number>();
const joinAttemptsPerIp = new Map<string, { count: number; resetAt: number }>();
const socketEventCounts = new Map<string, { count: number; resetAt: number }>();

export function resetRateLimits(): void {
  connectionsPerIp.clear();
  joinAttemptsPerIp.clear();
  socketEventCounts.clear();
}

function getIp(socket: Socket): string {
  return (socket.handshake.address || "unknown").replace(/^::ffff:/, "");
}

export function checkConnectionLimit(socket: Socket): boolean {
  const ip = getIp(socket);
  const count = connectionsPerIp.get(ip) || 0;
  if (count >= MAX_CONNECTIONS_PER_IP) return false;
  connectionsPerIp.set(ip, count + 1);
  return true;
}

export function releaseConnection(socket: Socket): void {
  const ip = getIp(socket);
  const count = connectionsPerIp.get(ip) || 0;
  if (count <= 1) {
    connectionsPerIp.delete(ip);
  } else {
    connectionsPerIp.set(ip, count - 1);
  }
}

export function checkJoinRateLimit(socket: Socket): boolean {
  const ip = getIp(socket);
  const now = Date.now();
  const entry = joinAttemptsPerIp.get(ip);
  if (!entry || now > entry.resetAt) {
    joinAttemptsPerIp.set(ip, { count: 1, resetAt: now + JOIN_WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_JOIN_ATTEMPTS_PER_IP) return false;
  entry.count++;
  return true;
}

export function checkSocketEventRate(socket: Socket): boolean {
  const now = Date.now();
  const entry = socketEventCounts.get(socket.id);
  if (!entry || now > entry.resetAt) {
    socketEventCounts.set(socket.id, { count: 1, resetAt: now + SOCKET_EVENT_WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_SOCKET_EVENTS) return false;
  entry.count++;
  return true;
}

export function clearSocketEventCount(socketId: string): void {
  socketEventCounts.delete(socketId);
}