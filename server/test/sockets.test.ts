import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Server } from "socket.io";
import { io as ioc, type Socket as ClientSocket } from "socket.io-client";
import { createServer } from "http";
import { initDb, seedCards } from "../src/db.js";
import { RoomStore } from "../src/rooms.js";
import { setupSocketHandlers, resetRateLimits } from "../src/sockets.js";
import { startGame, selectDeckType, selectCard, startPitching, revealMovie, endPitch, startVoting } from "../src/state-machine.js";
import type { Database } from "better-sqlite3";
import type { PublicRoomState, AudienceRoomState } from "@direct-to-video/shared";

const BASE = "http://localhost";

function waitForEvent<T>(socket: ClientSocket, event: string, timeout = 30000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeout);
    const handler = (data: T) => {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(data);
    };
    socket.on(event, handler);
  });
}

function connectAndJoin(port: number, code: string, name: string): Promise<{ socket: ClientSocket; state: PublicRoomState }> {
  return new Promise((resolve, reject) => {
    const socket = ioc(`${BASE}:${port}`, { forceNew: true, transports: ["websocket"] });
    const timer = setTimeout(() => { socket.close(); reject(new Error("Connect timeout")); }, 15000);
    const handler = (state: PublicRoomState) => {
      clearTimeout(timer);
      socket.off("room_joined", handler);
      resolve({ socket, state });
    };
    socket.on("room_joined", handler);
    socket.on("error", (msg: string) => {
      clearTimeout(timer);
      reject(new Error(msg));
    });
    socket.on("connect", () => {
      socket.emit("join_room", code, name);
    });
  });
}

function connectAudience(port: number, code: string): Promise<{ socket: ClientSocket; state: AudienceRoomState }> {
  return new Promise((resolve, reject) => {
    const socket = ioc(`${BASE}:${port}`, { forceNew: true, transports: ["websocket"] });
    const timer = setTimeout(() => { socket.close(); reject(new Error("Audience connect timeout")); }, 15000);
    const handler = (state: AudienceRoomState) => {
      clearTimeout(timer);
      socket.off("audience_joined", handler);
      resolve({ socket, state });
    };
    socket.on("audience_joined", handler);
    socket.on("error", (msg: string) => {
      clearTimeout(timer);
      reject(new Error(msg));
    });
    socket.on("connect", () => {
      socket.emit("join_audience", code);
    });
  });
}

async function playToRoundEnd(port: number, store: RoomStore, playerNames: string[]): Promise<{ sockets: ClientSocket[]; roomCode: string; states: Map<ClientSocket, PublicRoomState> }> {
  const sockets: ClientSocket[] = [];
  const states = new Map<ClientSocket, PublicRoomState>();
  let roomCode = "";

  for (let i = 0; i < playerNames.length; i++) {
    const result = await connectAndJoin(port, i === 0 ? "" : roomCode, playerNames[i]);
    sockets.push(result.socket);
    states.set(result.socket, result.state);
    if (i === 0) roomCode = result.state.code;
  }

  for (const socket of sockets) {
    socket.on("room_joined", (state: PublicRoomState) => {
      states.set(socket, state);
    });
  }

  let room = store.getRoom(roomCode)!;
  startGame(store, room);
  room = store.getRoom(roomCode)!;
  const executiveId = room.executiveId!;

  for (const writer of sockets) {
    const writerId = states.get(writer)!.myPlayerId!;
    if (writerId === executiveId) continue;
    room = store.getRoom(roomCode)!;
    selectDeckType(store, room, writerId, "plot");
    room = store.getRoom(roomCode)!;
    const writerPlayer = room.players.find((p) => p.id === writerId)!;
    const cardId = writerPlayer.hand[0]?.id;
    if (cardId) {
      selectCard(store, store.getRoom(roomCode)!, writerId, cardId);
    }
  }

  room = store.getRoom(roomCode)!;
  startPitching(store, room);
  room = store.getRoom(roomCode)!;

  for (const pitcherId of room.pitchOrder) {
    revealMovie(store, store.getRoom(roomCode)!, pitcherId);
    endPitch(store, store.getRoom(roomCode)!, pitcherId);
  }

  await new Promise((r) => setTimeout(r, 500));
  return { sockets, roomCode, states };
}

describe("sockets", () => {
  let db: Database;
  let store: RoomStore;
  let httpServer: ReturnType<typeof createServer>;
  let io: Server;
  let port: number;

  beforeEach(async () => {
    resetRateLimits();
    const handle = initDb(":memory:");
    db = handle.db;
    seedCards(db);
    store = new RoomStore(handle);
    httpServer = createServer();
    io = new Server(httpServer, { cors: { origin: "*" } });
    setupSocketHandlers(io, store);
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        port = (httpServer.address() as any).port;
        resolve();
      });
    });
  });

  afterEach(() => {
    io.close();
    httpServer.close();
    db.close();
  });

  it("creates a room when host joins", async () => {
    const client = ioc(`http://localhost:${port}`, { forceNew: true, transports: ["websocket"] });
    client.on("connect", () => client.emit("join_room", "", "Jason"));
    const state = await waitForEvent<PublicRoomState>(client, "room_joined");
    expect(state.code).toMatch(/^[A-Z]{4}$/);
    expect(state.phase).toBe("lobby");
    expect(state.players).toHaveLength(1);
    expect(state.players[0].name).toBe("Jason");
    expect(state.myPlayerId).toBeTruthy();
    client.disconnect();
  });

  it("joins an existing room as a player", async () => {
    const host = ioc(`http://localhost:${port}`, { forceNew: true, transports: ["websocket"] });
    host.on("connect", () => host.emit("join_room", "", "Jason"));
    const hostState = await waitForEvent<PublicRoomState>(host, "room_joined");
    const guest = ioc(`http://localhost:${port}`, { forceNew: true, transports: ["websocket"] });
    guest.on("connect", () => guest.emit("join_room", hostState.code, "Sarah"));
    const guestState = await waitForEvent<PublicRoomState>(guest, "room_joined");
    expect(guestState.players).toHaveLength(2);
    expect(guestState.players[1].name).toBe("Sarah");
    guest.disconnect();
    host.disconnect();
  });

  it("rejects joining a non-existent room", async () => {
    const client = ioc(`http://localhost:${port}`, { forceNew: true, transports: ["websocket"] });
    client.on("connect", () => client.emit("join_room", "ZZZZ", "Sarah"));
    const msg = await waitForEvent<string>(client, "error");
    expect(msg).toBe("Room not found");
    client.disconnect();
  });

  it("audience receives audience_joined state", async () => {
    const host = ioc(`http://localhost:${port}`, { forceNew: true, transports: ["websocket"] });
    host.on("connect", () => host.emit("join_room", "", "Jason"));
    const hostState = await waitForEvent<PublicRoomState>(host, "room_joined");
    const audience = ioc(`http://localhost:${port}`, { forceNew: true, transports: ["websocket"] });
    audience.on("connect", () => audience.emit("join_audience", hostState.code));
    const audState = await waitForEvent<AudienceRoomState>(audience, "audience_joined");
    expect(audState.code).toBe(hostState.code);
    expect(audState.phase).toBe("lobby");
    expect(audState.players).toHaveLength(1);
    audience.disconnect();
    host.disconnect();
  });

  describe("audience voting", () => {
    async function setupVotingTest(playerNames: string[]) {
      const { sockets, roomCode, states } = await playToRoundEnd(port, store, playerNames);
      await new Promise((r) => setTimeout(r, 500));
      const room = store.getRoom(roomCode)!;
      const audience = await connectAudience(port, roomCode);
      const execId = room.executiveId!;
      const execSocket = sockets.find((s) => states.get(s)!.myPlayerId === execId)!;
      const movies = room.movies.filter((m) => m.revealed);
      return { sockets, states, roomCode, audience, execSocket, movies };
    }

    it("executive can start voting when audience is present", async () => {
      const { sockets, execSocket, audience } = await setupVotingTest(["Jason", "Sarah", "Mike"]);
      expect(execSocket.connected).toBe(true);

      const votePromise = waitForEvent(execSocket, "voting_started");
      const statePromise = waitForEvent<PublicRoomState>(execSocket, "room_joined");
      execSocket.emit("start_voting");
      const voteState = await votePromise;
      expect(voteState).toBe(30);

      const updatedState = await statePromise;
      expect(updatedState.votingActive).toBe(true);

      sockets.forEach((s) => s.disconnect());
      audience.socket.disconnect();
    });

    it("audience can cast a vote during voting phase", async () => {
      const { sockets, execSocket, audience, movies } = await setupVotingTest(["Jason", "Sarah", "Mike"]);
      expect(movies.length).toBeGreaterThan(0);

      const votingStartedPromise = waitForEvent(execSocket, "voting_started");
      execSocket.emit("start_voting");
      await votingStartedPromise;
      await new Promise((r) => setTimeout(r, 300));

      const voteUpdatePromise = waitForEvent(audience.socket, "vote_update");
      audience.socket.emit("cast_vote", movies[0].playerId);
      const voteCounts = await voteUpdatePromise;
      expect(voteCounts).toBeInstanceOf(Array);
      const voted = (voteCounts as any[]).find((v) => v.playerId === movies[0].playerId);
      expect(voted).toBeTruthy();
      expect(voted.votes).toBeGreaterThanOrEqual(1);

      sockets.forEach((s) => s.disconnect());
      audience.socket.disconnect();
    });

    it("executive vote counts as 2x", async () => {
      const { sockets, execSocket, audience, movies } = await setupVotingTest(["Jason", "Sarah", "Mike"]);
      expect(movies.length).toBeGreaterThanOrEqual(2);

      const votingStartedPromise = waitForEvent(execSocket, "voting_started");
      execSocket.emit("start_voting");
      await votingStartedPromise;
      await new Promise((r) => setTimeout(r, 300));

      const audienceVotePromise = waitForEvent(audience.socket, "vote_update");
      audience.socket.emit("cast_vote", movies[1].playerId);
      await audienceVotePromise;

      const execVotePromise = waitForEvent(execSocket, "vote_update");
      execSocket.emit("cast_vote", movies[0].playerId);
      const voteCounts = await execVotePromise;
      const execVoted = (voteCounts as any[]).find((v) => v.playerId === movies[0].playerId);
      expect(execVoted.votes).toBe(2);

      sockets.forEach((s) => s.disconnect());
      audience.socket.disconnect();
    });

    it("end_voting selects winner and advances round", async () => {
      const { sockets, execSocket, audience, movies } = await setupVotingTest(["Jason", "Sarah", "Mike"]);

      const votingStartedPromise = waitForEvent(execSocket, "voting_started");
      execSocket.emit("start_voting");
      await votingStartedPromise;
      await new Promise((r) => setTimeout(r, 300));

      audience.socket.emit("cast_vote", movies[0].playerId);
      await new Promise((r) => setTimeout(r, 300));

      const endPromise = waitForEvent<string>(execSocket, "voting_ended");
      const statePromise = waitForEvent<PublicRoomState>(execSocket, "room_joined");
      execSocket.emit("end_voting");
      const winnerId = await endPromise;
      expect(winnerId).toBe(movies[0].playerId);

      const afterState = await statePromise;
      expect(afterState.votingActive).toBe(false);
      expect(afterState.phase).toBe("setup");
      expect(afterState.round.current).toBe(2);

      sockets.forEach((s) => s.disconnect());
      audience.socket.disconnect();
    });

    it("non-executive cannot start voting", async () => {
      const { sockets, states, audience } = await setupVotingTest(["Jason", "Sarah", "Mike"]);
      const execId = states.get(sockets[0])!.executiveId!;
      const nonExecSocket = sockets.find((s) => states.get(s)!.myPlayerId !== execId)!;

      const errorPromise = waitForEvent<string>(nonExecSocket, "error").catch(() => null);
      nonExecSocket.emit("start_voting");
      const result = await Promise.race([errorPromise, new Promise((r) => setTimeout(() => r("no-response"), 1000))]);
      expect(result).toBe("no-response");

      sockets.forEach((s) => s.disconnect());
      audience.socket.disconnect();
    });

    it("voting timer expiry tallies votes and selects winner", async () => {
      const { sockets, execSocket, audience, movies } = await setupVotingTest(["Jason", "Sarah", "Mike"]);

      const votingStartedPromise = waitForEvent(execSocket, "voting_started");
      execSocket.emit("start_voting");
      await votingStartedPromise;
      await new Promise((r) => setTimeout(r, 300));

      audience.socket.emit("cast_vote", movies[0].playerId);
      await new Promise((r) => setTimeout(r, 300));

      const endedPromise = waitForEvent<string>(execSocket, "voting_ended", 60000);
      const winnerId = await endedPromise;
      expect(winnerId).toBe(movies[0].playerId);

      sockets.forEach((s) => s.disconnect());
      audience.socket.disconnect();
    }, 120000);
  });
});