import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import type { PublicRoomState, AudienceRoomState, DeckType } from "@direct-to-video/shared";

const TARGET = process.env.STRESS_TARGET || "http://localhost:3000";
const NUM_ROOMS = parseInt(process.env.STRESS_ROOMS || "4", 10);
const PLAYERS_PER_ROOM = parseInt(process.env.STRESS_PLAYERS || "5", 10);
const AUDIENCE_PER_ROOM = parseInt(process.env.STRESS_AUDIENCE || "10", 10);
const NUM_ROUNDS = parseInt(process.env.STRESS_ROUNDS || "5", 10);

interface Player {
  name: string;
  socket: ClientSocket;
  playerId: string;
  roomCode: string;
  state: PublicRoomState | null;
}

interface AudienceMember {
  name: string;
  socket: ClientSocket;
  state: AudienceRoomState | null;
}

interface RoomInstance {
  id: number;
  players: Player[];
  audience: AudienceMember[];
  roomCode: string;
  finished: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function waitForHand(socket: ClientSocket, getState: () => PublicRoomState | null, timeout = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const state = getState();
      if (state && state.myHand && state.myHand.length > 0) { resolve(); return; }
      if (Date.now() - start > timeout) { reject(new Error("Timeout waiting for hand")); return; }
      setTimeout(check, 100);
    };
    check();
  });
}

function waitForMovieReady(socket: ClientSocket, getState: () => PublicRoomState | null, timeout = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const state = getState();
      if (state && state.myMovieReady) { resolve(); return; }
      if (Date.now() - start > timeout) { reject(new Error("Timeout waiting for movie ready")); return; }
      setTimeout(check, 100);
    };
    check();
  });
}

function waitForPhaseAll(players: Player[], phase: string, timeout = 15000): Promise<void> {
  return Promise.all(players.map((p) => {
    if (p.state?.phase === phase) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout waiting for phase ${phase}`)), timeout);
      const handler = (state: PublicRoomState) => {
        if (state.phase === phase) { clearTimeout(timer); p.socket.off("room_joined", handler); resolve(); }
      };
      p.socket.on("room_joined", handler);
    });
  })).then(() => {});
}

function connectPlayer(target: string, roomCode: string, name: string): Promise<Player> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(target, { forceNew: true, transports: ["websocket"] });
    const timer = setTimeout(() => { socket.close(); reject(new Error(`Timeout connecting ${name}`)); }, 15000);
    socket.on("room_joined", (state: PublicRoomState) => { clearTimeout(timer); resolve({ name, socket, playerId: state.myPlayerId!, roomCode: state.code, state }); });
    socket.on("connect", () => { socket.emit("join_room", roomCode, name); });
    socket.on("error", (msg: string) => { clearTimeout(timer); reject(new Error(`${name} error: ${msg}`)); });
  });
}

function connectAudience(target: string, roomCode: string, name: string): Promise<AudienceMember> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(target, { forceNew: true, transports: ["websocket"] });
    const timer = setTimeout(() => { socket.close(); reject(new Error(`Timeout connecting audience ${name}`)); }, 15000);
    socket.on("audience_joined", (state: AudienceRoomState) => { clearTimeout(timer); resolve({ name, socket, state }); });
    socket.on("connect", () => { socket.emit("join_audience", roomCode); });
    socket.on("error", (msg: string) => { clearTimeout(timer); reject(new Error(`Audience ${name} error: ${msg}`)); });
  });
}

async function runRoom(target: string, roomId: number, numPlayers: number, numAudience: number, numRounds: number): Promise<void> {
  const tag = `[Room ${roomId}]`;
  const players: Player[] = [];
  const audience: AudienceMember[] = [];
  let roomCode = "";

  for (let i = 0; i < numPlayers; i++) {
    const name = `R${roomId}P${i + 1}`;
    const code = i === 0 ? "" : roomCode;
    const player = await connectPlayer(target, code, name);
    if (i === 0) roomCode = player.roomCode;
    players.push(player);
    await sleep(100);
  }

  for (let i = 0; i < numAudience; i++) {
    const name = `R${roomId}A${i + 1}`;
    const audience_member = await connectAudience(target, roomCode, name);
    audience.push(audience_member);
    await sleep(50);
  }

  for (const p of players) {
    p.socket.on("room_joined", (state: PublicRoomState) => { p.state = state; });
  }
  for (const a of audience) {
    a.socket.on("audience_update", (state: AudienceRoomState) => { a.state = state; });
    a.socket.on("vote_update", (voteCounts: { playerId: string; votes: number }[]) => { if (a.state) a.state = { ...a.state, voteCounts }; });
    a.socket.on("voting_started", (secondsRemaining: number) => { if (a.state) a.state = { ...a.state, votingActive: true, timer: { running: true, secondsRemaining, pausedAt: null, pausedForNote: false, noteResumeAt: null } }; });
    a.socket.on("voting_ended", (_winnerId: string | null) => { if (a.state) a.state = { ...a.state, votingActive: false }; });
  }

  console.log(`${tag} ${players.length} players + ${audience.length} audience in room ${roomCode}`);

  const host = players[0];
  host.socket.emit("start_game");
  await sleep(500);

  for (let round = 1; round <= numRounds; round++) {
    await waitForPhaseAll(players, "setup").catch(() => null);
    await sleep(500);

    const currentState = players[0].state!;
    const noteGiverId = currentState.noteGiverId;
    const noteGiver = players.find((p) => p.playerId === noteGiverId);
    const writers = players.filter((p) => p.playerId !== noteGiverId);

    for (const writer of writers) {
      if (!writer.state?.myHand || writer.state.myHand.length === 0) {
        const deckType: DeckType = Math.random() < 0.5 ? "plot" : "character";
        const handPromise = waitForHand(writer.socket, () => writer.state);
        writer.socket.emit("select_deck_type", deckType);
        await handPromise;
      }
    }

    for (const writer of writers) {
      const cardId = writer.state?.myHand?.[0]?.id;
      if (cardId) {
        const moviePromise = waitForMovieReady(writer.socket, () => writer.state).catch(() => null);
        writer.socket.emit("select_card", cardId);
        await moviePromise;
      }
    }

    await waitForPhaseAll(players, "pitching");

    const pitcherIds = writers.map((w) => w.playerId);
    for (let pi = 0; pi < pitcherIds.length; pi++) {
      const pitcher = players.find((p) => p.playerId === pitcherIds[pi]);
      if (!pitcher) continue;
      pitcher.socket.emit("reveal_movie");
      await sleep(200);
      noteGiver?.socket.emit("start_timer");
      await sleep(300);
      const ngState = noteGiver!.state!;
      const notes = ngState.myNoteGiverNotes || [];
      if (notes.length > 0 && Math.random() < 0.7) {
        noteGiver?.socket.emit("play_note", notes[0].id);
        await sleep(1000);
      } else {
        await sleep(500);
      }
      noteGiver?.socket.emit("end_pitch");
      await sleep(400);
    }

    await sleep(1000);
    await waitForPhaseAll(players, "round-end");

    const movies = players[0].state?.movies || [];
    if (movies.length > 0) {
      // Voting auto-starts; everyone casts a vote (no self-votes for players)
      for (const player of players) {
        const votable = movies.filter((m) => m.playerId !== player.playerId);
        if (votable.length === 0) continue;
        const voteTarget = votable[Math.floor(Math.random() * votable.length)];
        player.socket.emit("cast_vote", voteTarget.playerId);
      }
      for (const a of audience) {
        const movie = movies[Math.floor(Math.random() * movies.length)];
        a.socket.emit("cast_vote", movie.playerId);
      }
      await sleep(2000);

      const postWinState = players[0].state!;
      if (postWinState.phase === "game-end") {
        const sorted = [...postWinState.players].sort((a, b) => b.score - a.score);
        console.log(`${tag} Game ended. Scores: ${sorted.map((p) => `${p.name}=${p.score}`).join(", ")}`);
        break;
      }
      console.log(`${tag} Round ${round} complete`);
    }
  }

  for (const p of players) p.socket.disconnect();
  for (const a of audience) a.socket.disconnect();
  console.log(`${tag} Disconnected all`);
}

async function main(): Promise<void> {
  const line = "=".repeat(60);
  console.log(`\n${line}\nMULTI-ROOM STRESS TEST: ${NUM_ROOMS} rooms, ${PLAYERS_PER_ROOM} players + ${AUDIENCE_PER_ROOM} audience each, ${NUM_ROUNDS} rounds\n${line}`);

  const roomPromises: Promise<void>[] = [];
  for (let r = 1; r <= NUM_ROOMS; r++) {
    roomPromises.push(runRoom(TARGET, r, PLAYERS_PER_ROOM, AUDIENCE_PER_ROOM, NUM_ROUNDS));
    await sleep(500);
  }

  const results = await Promise.allSettled(roomPromises);

  let passed = 0;
  let failed = 0;
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === "fulfilled") {
      passed++;
    } else {
      failed++;
      console.error(`\n[Room ${i + 1}] FAILED: ${(results[i] as PromiseRejectedResult).reason}`);
    }
  }

  console.log(`\n${line}\nMULTI-ROOM STRESS TEST: ${passed} passed, ${failed} failed\n${line}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("\n!!! MULTI-ROOM STRESS TEST CRASHED !!!");
  console.error(err);
  process.exit(1);
});