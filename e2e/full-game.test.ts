import { test, expect } from "@playwright/test";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import type { PublicRoomState, DeckType } from "@pitch-storm/shared";

const BASE = "http://localhost:3100";

/**
 * E2E test for a full 2-player Pitch Storm game.
 *
 * Player socket actions (join, start game, select deck, select card,
 * draw blind, start timer, end pitch, select winner) are driven through
 * direct socket.io connections from the test process. A browser page
 * for the audience verifies that the UI renders correctly in response
 * to server-pushed state changes across all phases.
 *
 * This verifies: real-time state synchronization (socket events → React
 * renders), all phase transitions (lobby → setup → card-selection →
 * pitching → round-end → setup → pitching → round-end → game-end),
 * the audience spectator view, and the game-end scoreboard.
 */

interface PlayerConnection {
  socket: ClientSocket;
  playerId: string;
  roomCode: string;
}

function connectPlayer(base: string, roomCode: string, name: string): Promise<PlayerConnection> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(base, { forceNew: true });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`Timeout connecting ${name}`));
    }, 10000);

    socket.on("connect", () => {
      socket.emit("join_room", roomCode, name);
    });

    socket.on("room_joined", (state: PublicRoomState) => {
      clearTimeout(timer);
      resolve({ socket, playerId: state.myPlayerId!, roomCode: state.code });
    });

    socket.on("error", (msg: string) => {
      clearTimeout(timer);
      reject(new Error(`${name} socket error: ${msg}`));
    });
  });
}

function waitForState(socket: ClientSocket, timeout = 10000): Promise<PublicRoomState> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timeout waiting for room_joined")), timeout);
    socket.once("room_joined", (state: PublicRoomState) => {
      clearTimeout(timer);
      resolve(state);
    });
  });
}

test("full 2-player game", async ({ browser }) => {
  // ── Create room: Host connects via socket ──
  const host = await connectPlayer(BASE, "", "Host");
  const roomCode = host.roomCode;
  expect(roomCode).toMatch(/^[A-Z]{4}$/);

  // ── Guest connects via socket ──
  const guest = await connectPlayer(BASE, roomCode, "Guest");

  // ── Audience joins via the browser UI ──
  const audiencePage = await browser.newPage();
  await audiencePage.goto(BASE);
  await audiencePage.fill('input[placeholder*="Room Code"]', roomCode);
  await audiencePage.click("text=Join as Audience");
  await audiencePage.waitForURL(`**/audience/${roomCode}`);
  await expect(audiencePage.locator(".audience-view")).toBeVisible({ timeout: 10000 });

  // ── Verify lobby shows both players ──
  await expect(audiencePage.locator(".audience-lobby")).toContainText("Host");
  await expect(audiencePage.locator(".audience-lobby")).toContainText("Guest");
  await expect(audiencePage.locator("text=/Waiting for game to start/i")).toBeVisible();

  // ── Host starts game ──
  const hs1 = waitForState(host.socket);
  const gs1 = waitForState(guest.socket);
  host.socket.emit("start_game");
  await hs1;
  await gs1;

  // Audience sees setup phase
  await expect(audiencePage.locator("text=/Writers are choosing/i")).toBeVisible({ timeout: 10000 });

  // ── Round 1: Host = Executive, Guest = Writer ──

  // Guest selects deck type
  const gs2 = waitForState(guest.socket);
  guest.socket.emit("select_deck_type", "plot" as DeckType);
  const gs2State = await gs2;
  expect(gs2State.myHand?.length).toBe(3);

  // Guest selects a card
  const gs3 = waitForState(guest.socket);
  const cardId = gs2State.myHand![0].id;
  guest.socket.emit("select_card", cardId);

  // selectCard auto-draws blind card → triggers pitching phase
  const gs4 = waitForState(guest.socket);
  const hostState4 = waitForState(host.socket);
  const gs4State = await gs4;
  const hs4 = await hostState4;
  expect(gs4State.phase).toBe("pitching");
  expect(hs4.phase).toBe("pitching");

  // Audience sees pitching phase with timer and pitcher name
  await expect(audiencePage.locator(".timer")).toBeVisible({ timeout: 10000 });
  await expect(audiencePage.locator("text=/Now Pitching: Guest/i")).toBeVisible({ timeout: 10000 });

  // Guest reveals their movie
  guest.socket.emit("reveal_movie");

  // Host starts timer
  const timerStarted = new Promise<void>((resolve) => {
    host.socket.once("timer_started", () => resolve());
  });
  host.socket.emit("start_timer");
  await timerStarted;
  await new Promise((r) => setTimeout(r, 1500));

  // Host ends pitch → round-end
  const hs5 = waitForState(host.socket);
  host.socket.emit("end_pitch");
  const hs5State = await hs5;
  expect(hs5State.phase).toBe("round-end");

  // Audience sees round-end
  await expect(audiencePage.locator("text=/Executive is choosing/i")).toBeVisible({ timeout: 10000 });

  // Host picks winner (Guest's movie — the only writer)
  const winnerId = hs5State.movies[0].playerId;
  const hs6 = waitForState(host.socket);
  host.socket.emit("select_winner", winnerId);
  const hs6State = await hs6;
  expect(hs6State.phase).toBe("setup");
  expect(hs6State.round.current).toBe(2);

  // ── Round 2: roles swap (Guest → Executive, Host → Writer) ──

  // Audience sees setup phase again
  await expect(audiencePage.locator("text=/Writers are choosing/i")).toBeVisible({ timeout: 10000 });

  // Host (writer) selects deck type
  const hs7 = waitForState(host.socket);
  host.socket.emit("select_deck_type", "plot" as DeckType);
  const hs7State = await hs7;
  expect(hs7State.myHand?.length).toBe(3);

  // Host selects a card — auto-draws blind → triggers pitching
  const hs9 = waitForState(host.socket);
  const cardId2 = hs7State.myHand![0].id;
  host.socket.emit("select_card", cardId2);
  const hs9State = await hs9;
  expect(hs9State.phase).toBe("pitching");

  // Audience sees new pitcher (Host)
  await expect(audiencePage.locator("text=/Now Pitching: Host/i")).toBeVisible({ timeout: 10000 });

  // Host reveals their movie
  host.socket.emit("reveal_movie");

  // Guest (Executive) starts timer
  const timer2 = new Promise<void>((resolve) => {
    guest.socket.once("timer_started", () => resolve());
  });
  guest.socket.emit("start_timer");
  await timer2;
  await new Promise((r) => setTimeout(r, 1500));

  // Guest ends pitch → round-end
  const gs10 = waitForState(guest.socket);
  guest.socket.emit("end_pitch");
  const gs10State = await gs10;
  expect(gs10State.phase).toBe("round-end");

  // Audience sees round-end
  await expect(audiencePage.locator("text=/Executive is choosing/i")).toBeVisible({ timeout: 10000 });

  // Guest picks winner (Host's movie)
  const winnerId2 = gs10State.movies[0].playerId;
  const gs11 = waitForState(guest.socket);
  guest.socket.emit("select_winner", winnerId2);
  const gs11State = await gs11;
  expect(gs11State.phase).toBe("game-end");

  // ── Game end ──
  // Audience sees game-end screen
  await expect(audiencePage.locator(".audience-game-end")).toBeVisible({ timeout: 10000 });
  await expect(audiencePage.locator(".winner-spotlight")).toBeVisible({ timeout: 10000 });
  await expect(audiencePage.locator(".audience-footer .scoreboard")).toBeVisible({ timeout: 10000 });

  // Verify scoreboard shows both player names
  const scoreboardText = await audiencePage.locator(".audience-footer .scoreboard").textContent();
  expect(scoreboardText).toContain("Host");
  expect(scoreboardText).toContain("Guest");

  // Cleanup
  host.socket.close();
  guest.socket.close();
  await audiencePage.close();
});