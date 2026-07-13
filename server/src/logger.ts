import { resolve } from "path";
import { mkdirSync, appendFileSync } from "fs";

const LOG_DIR = resolve(process.cwd(), "data");
const LOG_FILE = resolve(LOG_DIR, "pitchstorm.log");
const GAME_LOG_FILE = resolve(LOG_DIR, "games.log");

mkdirSync(LOG_DIR, { recursive: true });

function timestamp(): string {
  return new Date().toISOString();
}

function formatIp(ip: string): string {
  return ip.replace(/^::ffff:/, "");
}

function appendLog(file: string, message: string): void {
  const line = `[${timestamp()}] ${message}\n`;
  appendFileSync(file, line);
}

export const logger = {
  info(message: string): void {
    const line = `${message}`;
    console.log(line);
    appendLog(LOG_FILE, `INFO  ${line}`);
  },

  http(method: string, path: string, ip: string): void {
    const line = `HTTP ${method} ${path} from ${formatIp(ip)}`;
    console.log(line);
    appendLog(LOG_FILE, `HTTP  ${line}`);
  },

  connect(ip: string, socketId: string): void {
    const line = `CONNECT ${formatIp(ip)} socket=${socketId}`;
    console.log(line);
    appendLog(LOG_FILE, `CONN  ${line}`);
  },

  disconnect(ip: string, socketId: string): void {
    const line = `DISCONNECT ${formatIp(ip)} socket=${socketId}`;
    console.log(line);
    appendLog(LOG_FILE, `DISC  ${line}`);
  },

  joinRoom(ip: string, roomCode: string, name: string, isHost: boolean): void {
    const role = isHost ? "HOST" : "GUEST";
    const line = `JOIN ${formatIp(ip)} room=${roomCode} name="${name}" role=${role}`;
    console.log(line);
    appendLog(LOG_FILE, `JOIN  ${line}`);
    appendLog(GAME_LOG_FILE, `${timestamp()} JOIN room=${roomCode} name="${name}" ip=${formatIp(ip)} role=${role}`);
  },

  joinAudience(ip: string, roomCode: string): void {
    const line = `AUDIENCE ${formatIp(ip)} room=${roomCode}`;
    console.log(line);
    appendLog(LOG_FILE, `AUD  ${line}`);
    appendLog(GAME_LOG_FILE, `${timestamp()} AUDIENCE room=${roomCode} ip=${formatIp(ip)}`);
  },

  startGame(roomCode: string, playerCount: number): void {
    const line = `START room=${roomCode} players=${playerCount}`;
    console.log(line);
    appendLog(LOG_FILE, `GAME  ${line}`);
    appendLog(GAME_LOG_FILE, `${timestamp()} START room=${roomCode} players=${playerCount}`);
  },

  endGame(roomCode: string, scores: { name: string; score: number }[]): void {
    const scoreStr = scores.map((s) => `${s.name}=${s.score}`).join(", ");
    const line = `END room=${roomCode} scores=[${scoreStr}]`;
    console.log(line);
    appendLog(LOG_FILE, `GAME  ${line}`);
    appendLog(GAME_LOG_FILE, `${timestamp()} END room=${roomCode} scores=[${scoreStr}]`);
  },

  roundEnd(roomCode: string, round: number, total: number, winner: string): void {
    const line = `ROUND room=${roomCode} ${round}/${total} winner="${winner}"`;
    console.log(line);
    appendLog(GAME_LOG_FILE, `${timestamp()} ROUND room=${roomCode} ${round}/${total} winner="${winner}"`);
  },

  error(ip: string, socketId: string, message: string): void {
    const line = `ERROR ${formatIp(ip)} socket=${socketId} msg="${message}"`;
    console.error(line);
    appendLog(LOG_FILE, `ERR   ${line}`);
  },
};
