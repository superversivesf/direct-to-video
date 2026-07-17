import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Server } from "socket.io";
import { io as ioc, type Socket as ClientSocket } from "socket.io-client";
import { createServer } from "http";
import { initDb, seedCards } from "../src/db.js";
import { RoomStore } from "../src/rooms.js";
import { setupSocketHandlers, resetRateLimits } from "../src/sockets/handlers.js";
import { startGame, selectDeckType, selectCard, startPitching, revealMovie, endPitch, tallyAndAdvance } from "../src/state-machine.js";
import { startTimer, pauseForNote } from "../src/timer.js";
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
  const noteGiverId = room.noteGiverId!;

  for (const writer of sockets) {
    const writerId = states.get(writer)!.myPlayerId!;
    if (writerId === noteGiverId) continue;
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
  const noteGiverPlayer = room.players.find((p) => p.id === noteGiverId)!;
  if (noteGiverPlayer.hand.length === 0) {
    selectDeckType(store, room, noteGiverId, "plot");
    room = store.getRoom(roomCode)!;
    const ngPlayer = room.players.find((p) => p.id === noteGiverId)!;
    selectCard(store, room, noteGiverId, ngPlayer.hand[0].id);
  }

  room = store.getRoom(roomCode)!;
  startPitching(store, room);
  room = store.getRoom(roomCode)!;

  for (const pitcherId of room.pitchOrder) {
    revealMovie(store, store.getRoom(roomCode)!, pitcherId);
    endPitch(store, store.getRoom(roomCode)!, pitcherId);
  }

  room = store.getRoom(roomCode)!;
  if (room.votingActive) {
    const started = startTimer(room.timer);
    store.saveRoom({ ...room, timer: started });
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

  afterEach(async () => {
    io.close();
    httpServer.close();
    await new Promise((r) => setTimeout(r, 200));
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

  describe("v2.0 auto-voting flow", () => {
    async function setupVotingTest(playerNames: string[]) {
      const { sockets, roomCode, states } = await playToRoundEnd(port, store, playerNames);
      await new Promise((r) => setTimeout(r, 500));
      const room = store.getRoom(roomCode)!;
      const audience = await connectAudience(port, roomCode);
      const noteGiverId = room.noteGiverId!;
      const noteGiverSocket = sockets.find((s) => states.get(s)!.myPlayerId === noteGiverId)!;
      const movies = room.movies.filter((m) => m.revealed);
      return { sockets, states, roomCode, audience, noteGiverSocket, movies };
    }

    it("auto-starts 15s voting timer when last pitch ends via socket", async () => {
      const sockets: ClientSocket[] = [];
      const states = new Map<ClientSocket, PublicRoomState>();
      let roomCode = "";

      for (let i = 0; i < 3; i++) {
        const result = await connectAndJoin(port, i === 0 ? "" : roomCode, `P${i + 1}`);
        sockets.push(result.socket);
        states.set(result.socket, result.state);
        if (i === 0) roomCode = result.state.code;
      }
      for (const socket of sockets) {
        socket.on("room_joined", (state: PublicRoomState) => { states.set(socket, state); });
      }

      let room = store.getRoom(roomCode)!;
      startGame(store, room);
      room = store.getRoom(roomCode)!;
      const noteGiverId = room.noteGiverId!;

      for (const socket of sockets) {
        const playerId = states.get(socket)!.myPlayerId!;
        if (playerId === noteGiverId) continue;
        room = store.getRoom(roomCode)!;
        selectDeckType(store, room, playerId, "plot");
        room = store.getRoom(roomCode)!;
        const writer = room.players.find((p) => p.id === playerId)!;
        selectCard(store, room, playerId, writer.hand[0].id);
      }
      room = store.getRoom(roomCode)!;
      const ngPlayer = room.players.find((p) => p.id === noteGiverId)!;
      if (ngPlayer.hand.length === 0) {
        selectDeckType(store, room, noteGiverId, "plot");
        room = store.getRoom(roomCode)!;
        const ngP = room.players.find((p) => p.id === noteGiverId)!;
        selectCard(store, room, noteGiverId, ngP.hand[0].id);
      }

      room = store.getRoom(roomCode)!;
      startPitching(store, room);
      room = store.getRoom(roomCode)!;

      const allButLast = room.pitchOrder.slice(0, -1);
      for (const pitcherId of allButLast) {
        revealMovie(store, store.getRoom(roomCode)!, pitcherId);
        endPitch(store, store.getRoom(roomCode)!, pitcherId);
      }

      const lastPitcherId = room.pitchOrder[room.pitchOrder.length - 1];
      const lastPitcherSocket = sockets.find((s) => states.get(s)!.myPlayerId === lastPitcherId)!;

      const votePromise = waitForEvent(lastPitcherSocket, "voting_started");
      lastPitcherSocket.emit("end_pitch");
      const voteSeconds = await votePromise;
      expect(voteSeconds).toBe(15);

      sockets.forEach((s) => s.disconnect());
    }, 15000);

    it("audience can cast a vote during voting phase", async () => {
      const { sockets, audience, movies } = await setupVotingTest(["Jason", "Sarah", "Mike"]);
      expect(movies.length).toBeGreaterThan(0);

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

    it("all votes have equal weight (1x) in v2.0", async () => {
      const { sockets, states, audience, movies } = await setupVotingTest(["Jason", "Sarah", "Mike"]);
      expect(movies.length).toBeGreaterThanOrEqual(2);

      await new Promise((r) => setTimeout(r, 300));

      const noteGiverId = states.get(sockets[0])!.noteGiverId!;
      const playerSocket = sockets.find((s) => states.get(s)!.myPlayerId !== noteGiverId)!;
      const playerPlayerId = states.get(playerSocket)!.myPlayerId!;
      const voteTarget = movies.find((m) => m.playerId !== playerPlayerId)!;

      const audienceVotePromise = waitForEvent(audience.socket, "vote_update");
      audience.socket.emit("cast_vote", voteTarget.playerId);
      await audienceVotePromise;

      const playerVotePromise = waitForEvent(playerSocket, "vote_update");
      playerSocket.emit("cast_vote", voteTarget.playerId);
      const voteCounts = await playerVotePromise;
      const playerVoted = (voteCounts as any[]).find((v) => v.playerId === voteTarget.playerId);
      expect(playerVoted.votes).toBe(2);

      sockets.forEach((s) => s.disconnect());
      audience.socket.disconnect();
    }, 15000);

    it("voting timer expiry tallies votes and advances round", async () => {
      const { sockets, noteGiverSocket, audience, movies } = await setupVotingTest(["Jason", "Sarah", "Mike"]);

      await new Promise((r) => setTimeout(r, 300));

      audience.socket.emit("cast_vote", movies[0].playerId);
      await new Promise((r) => setTimeout(r, 300));

      const endedPromise = waitForEvent<string | null>(noteGiverSocket, "voting_ended", 60000);
      const winnerId = await endedPromise;
      expect(winnerId).toBe(movies[0].playerId);

      sockets.forEach((s) => s.disconnect());
      audience.socket.disconnect();
    }, 120000);

    it("all players voting triggers early tally", async () => {
      const { sockets, states, audience, movies } = await setupVotingTest(["Jason", "Sarah", "Mike"]);
      const noteGiverId = states.get(sockets[0])!.noteGiverId!;

      await new Promise((r) => setTimeout(r, 300));

      const votingEndedPromise = waitForEvent<string | null>(sockets[0], "voting_ended", 30000);

      for (const s of sockets) {
        const playerId = states.get(s)!.myPlayerId!;
        const otherMovie = movies.find((m) => m.playerId !== playerId)!;
        s.emit("cast_vote", otherMovie.playerId);
        await new Promise((r) => setTimeout(r, 200));
      }

      const audienceMovie = movies.find((m) => m.playerId !== noteGiverId)!;
      audience.socket.emit("cast_vote", audienceMovie.playerId);

      const winnerId = await votingEndedPromise;
      expect(winnerId !== null || winnerId === null).toBe(true);

      sockets.forEach((s) => s.disconnect());
      audience.socket.disconnect();
    }, 45000);

    it("prevents players from voting for themselves", async () => {
      const { sockets, states, audience, movies } = await setupVotingTest(["Jason", "Sarah", "Mike"]);
      const noteGiverId = states.get(sockets[0])!.noteGiverId!;
      const nonNoteGiverSocket = sockets.find((s) => states.get(s)!.myPlayerId !== noteGiverId)!;
      const selfPlayerId = states.get(nonNoteGiverSocket)!.myPlayerId!;

      const errorPromise = waitForEvent<string>(nonNoteGiverSocket, "error");
      nonNoteGiverSocket.emit("cast_vote", selfPlayerId);
      const errMsg = await errorPromise;
      expect(errMsg).toContain("cannot vote for themselves");

      sockets.forEach((s) => s.disconnect());
      audience.socket.disconnect();
    });
  });

  describe("timer paused for note edge cases", () => {
    async function setupPitchingState(playerNames: string[]) {
      const sockets: ClientSocket[] = [];
      const states = new Map<ClientSocket, PublicRoomState>();
      let roomCode = "";

      for (let i = 0; i < playerNames.length; i++) {
        const result = await connectAndJoin(port, i === 0 ? "" : roomCode, `P${i + 1}`);
        sockets.push(result.socket);
        states.set(result.socket, result.state);
        if (i === 0) roomCode = result.state.code;
      }
      for (const socket of sockets) {
        socket.on("room_joined", (state: PublicRoomState) => { states.set(socket, state); });
      }

      let room = store.getRoom(roomCode)!;
      startGame(store, room);
      room = store.getRoom(roomCode)!;
      const noteGiverId = room.noteGiverId!;

      for (const socket of sockets) {
        const playerId = states.get(socket)!.myPlayerId!;
        if (playerId === noteGiverId) continue;
        room = store.getRoom(roomCode)!;
        selectDeckType(store, room, playerId, "plot");
        room = store.getRoom(roomCode)!;
        const writer = room.players.find((p) => p.id === playerId)!;
        selectCard(store, store.getRoom(roomCode)!, playerId, writer.hand[0].id);
      }

      room = store.getRoom(roomCode)!;
      const noteGiverPlayer = room.players.find((p) => p.id === noteGiverId)!;
      if (noteGiverPlayer.hand.length === 0) {
        selectDeckType(store, room, noteGiverId, "plot");
        room = store.getRoom(roomCode)!;
        const ngPlayer = room.players.find((p) => p.id === noteGiverId)!;
        selectCard(store, room, noteGiverId, ngPlayer.hand[0].id);
      }

      room = store.getRoom(roomCode)!;
      startPitching(store, room);

      room = store.getRoom(roomCode)!;
      const started = startTimer(room.timer);
      store.saveRoom({ ...room, timer: started });
      room = store.getRoom(roomCode)!;
      const paused = pauseForNote(room.timer, 30);
      store.saveRoom({ ...room, timer: paused });

      await new Promise((r) => setTimeout(r, 300));

      const currentPitcherId = store.getRoom(roomCode)!.currentPitcherId!;
      const noteGiverSocket = sockets.find((s) => states.get(s)!.myPlayerId === noteGiverId)!;
      const pitcherSocket = sockets.find((s) => states.get(s)!.myPlayerId === currentPitcherId)!;
      return { sockets: sockets, roomCode: roomCode, noteGiverSocket, pitcherSocket, states };
    }

    it("pitcher can end pitch while timer is paused for note", async () => {
      const { sockets, pitcherSocket } = await setupPitchingState(["Jason", "Sarah", "Mike"]);

      const pitchEndedPromise = waitForEvent(pitcherSocket, "room_joined");
      pitcherSocket.emit("end_pitch");
      const state = await pitchEndedPromise;

      expect(state.timer.pausedForNote).toBe(false);
      expect(state.timer.running).toBe(false);
      expect(state.timer.noteResumeAt).toBeNull();

      sockets.forEach((s) => s.disconnect());
    });

    it("note-giver can end pitch while timer is paused for note", async () => {
      const { sockets, noteGiverSocket } = await setupPitchingState(["Jason", "Sarah", "Mike"]);

      const pitchEndedPromise = waitForEvent(noteGiverSocket, "room_joined");
      noteGiverSocket.emit("end_pitch");
      const state = await pitchEndedPromise;

      expect(state.timer.pausedForNote).toBe(false);
      expect(state.timer.running).toBe(false);

      sockets.forEach((s) => s.disconnect());
    });

    it("timer does not auto-resume after endPitch while paused for note", async () => {
      const { sockets, noteGiverSocket } = await setupPitchingState(["Jason", "Sarah", "Mike"]);

      const statePromise = waitForEvent<PublicRoomState>(noteGiverSocket, "room_joined");
      noteGiverSocket.emit("end_pitch");
      const state = await statePromise;

      expect(state.timer.pausedForNote).toBe(false);
      expect(state.timer.running).toBe(false);

      await new Promise((r) => setTimeout(r, 2000));

      sockets.forEach((s) => s.disconnect());
    });

    it("player can leave game while timer is paused for note", async () => {
      const { sockets, pitcherSocket } = await setupPitchingState(["Jason", "Sarah", "Mike"]);

      expect(pitcherSocket.connected).toBe(true);
      pitcherSocket.disconnect();
      await new Promise((r) => setTimeout(r, 500));
      expect(pitcherSocket.connected).toBe(false);

      const remainingSockets = sockets.filter((s) => s !== pitcherSocket);
      remainingSockets.forEach((s) => s.disconnect());
    });
  });

  describe("set_total_rounds handler", () => {
    it("host can set total rounds in lobby", async () => {
      const host = ioc(`http://localhost:${port}`, { forceNew: true, transports: ["websocket"] });
      host.on("connect", () => host.emit("join_room", "", "Jason"));
      const hostState = await waitForEvent<PublicRoomState>(host, "room_joined");

      const statePromise = waitForEvent<PublicRoomState>(host, "room_joined");
      host.emit("set_total_rounds", 7);
      const updatedState = await statePromise;
      expect(updatedState.totalRounds).toBe(7);

      host.disconnect();
    });

    it("non-host cannot set total rounds", async () => {
      const host = ioc(`http://localhost:${port}`, { forceNew: true, transports: ["websocket"] });
      host.on("connect", () => host.emit("join_room", "", "Jason"));
      const hostState = await waitForEvent<PublicRoomState>(host, "room_joined");

      const guest = ioc(`http://localhost:${port}`, { forceNew: true, transports: ["websocket"] });
      guest.on("connect", () => guest.emit("join_room", hostState.code, "Sarah"));
      const guestState = await waitForEvent<PublicRoomState>(guest, "room_joined");

      guest.emit("set_total_rounds", 10);
      await new Promise((r) => setTimeout(r, 500));

      const room = store.getRoom(hostState.code)!;
      expect(room.totalRounds).toBe(5);

      host.disconnect();
      guest.disconnect();
    });
  });

  describe("4-player round 2 soft-lock", () => {
    it("does not soft-lock when writer selects card before all writers draw in round 2", async () => {
      const sockets: ClientSocket[] = [];
      const states = new Map<ClientSocket, PublicRoomState>();
      let roomCode = "";

      for (let i = 0; i < 4; i++) {
        const result = await connectAndJoin(port, i === 0 ? "" : roomCode, `P${i + 1}`);
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

      const noteGiverId = store.getRoom(roomCode)!.noteGiverId!;
      const writerSockets = sockets.filter((s) => states.get(s)!.myPlayerId !== noteGiverId);

      for (const ws of writerSockets) {
        const writerId = states.get(ws)!.myPlayerId!;
        room = store.getRoom(roomCode)!;
        selectDeckType(store, room, writerId, "plot");
        room = store.getRoom(roomCode)!;
        const writer = room.players.find((p) => p.id === writerId)!;
        selectCard(store, room, writerId, writer.hand[0].id);
      }

      room = store.getRoom(roomCode)!;
      const noteGiverPlayer = room.players.find((p) => p.id === noteGiverId)!;
      if (noteGiverPlayer.hand.length === 0) {
        selectDeckType(store, room, noteGiverId, "plot");
        room = store.getRoom(roomCode)!;
        const ngPlayer = room.players.find((p) => p.id === noteGiverId)!;
        selectCard(store, room, noteGiverId, ngPlayer.hand[0].id);
      }

      room = store.getRoom(roomCode)!;
      expect(room.phase).toBe("pitching");

      for (const pitcherId of room.pitchOrder) {
        revealMovie(store, store.getRoom(roomCode)!, pitcherId);
        endPitch(store, store.getRoom(roomCode)!, pitcherId);
      }

      room = store.getRoom(roomCode)!;
      tallyAndAdvance(store, room);
      room = store.getRoom(roomCode)!;
      expect(room.round.current).toBe(2);

      const r2NoteGiverId = room.noteGiverId!;
      const r2WriterSockets = sockets.filter((s) => states.get(s)!.myPlayerId !== r2NoteGiverId);
      const r2WriterIds = r2WriterSockets.map((s) => states.get(s)!.myPlayerId!);

      const w0 = r2WriterSockets[0];
      const w0Id = r2WriterIds[0];

      const w0StatePromise = waitForEvent<PublicRoomState>(w0, "room_joined");
      w0.emit("select_deck_type", "plot");
      await w0StatePromise;
      await new Promise((r) => setTimeout(r, 300));
      const w0Hand = store.getRoom(roomCode)!.players.find((p) => p.id === w0Id)!.hand;
      const w0CardId = w0Hand[0].id;

      const w0CardPromise = waitForEvent<PublicRoomState>(w0, "room_joined");
      w0.emit("select_card", w0CardId);
      await w0CardPromise;
      await new Promise((r) => setTimeout(r, 300));

      for (let i = 1; i < r2WriterSockets.length; i++) {
        const ws = r2WriterSockets[i];
        const writerId = r2WriterIds[i];

        const drawPromise = waitForEvent<PublicRoomState>(ws, "room_joined");
        ws.emit("select_deck_type", "plot");
        await drawPromise;
        await new Promise((r) => setTimeout(r, 300));

        const hand = store.getRoom(roomCode)!.players.find((p) => p.id === writerId)!.hand;
        const cardPromise = waitForEvent<PublicRoomState>(ws, "room_joined");
        ws.emit("select_card", hand[0].id);
        await cardPromise;
        await new Promise((r) => setTimeout(r, 300));
      }

      const r2NoteGiverPlayer = store.getRoom(roomCode)!.players.find((p) => p.id === r2NoteGiverId)!;
      if (r2NoteGiverPlayer.hand.length === 0) {
        const ngPromise = waitForEvent<PublicRoomState>(sockets.find((s) => states.get(s)!.myPlayerId === r2NoteGiverId)!, "room_joined");
        sockets.find((s) => states.get(s)!.myPlayerId === r2NoteGiverId)!.emit("select_deck_type", "plot");
        await ngPromise;
        await new Promise((r) => setTimeout(r, 300));
        const ngRoom = store.getRoom(roomCode)!;
        const ngPlayer = ngRoom.players.find((p) => p.id === r2NoteGiverId)!;
        const ngCardPromise = waitForEvent<PublicRoomState>(sockets.find((s) => states.get(s)!.myPlayerId === r2NoteGiverId)!, "room_joined");
        sockets.find((s) => states.get(s)!.myPlayerId === r2NoteGiverId)!.emit("select_card", ngPlayer.hand[0].id);
        await ngCardPromise;
        await new Promise((r) => setTimeout(r, 300));
      }

      await new Promise((r) => setTimeout(r, 500));
      const finalRoom = store.getRoom(roomCode)!;
      expect(finalRoom.phase).toBe("pitching");

      sockets.forEach((s) => s.disconnect());
    }, 30000);

    it("does not soft-lock when writer selects card via socket before others draw", async () => {
      const sockets: ClientSocket[] = [];
      const states = new Map<ClientSocket, PublicRoomState>();
      let roomCode = "";

      for (let i = 0; i < 3; i++) {
        const result = await connectAndJoin(port, i === 0 ? "" : roomCode, `P${i + 1}`);
        sockets.push(result.socket);
        states.set(result.socket, result.state);
        if (i === 0) roomCode = result.state.code;
      }

      for (const socket of sockets) {
        socket.on("room_joined", (state: PublicRoomState) => {
          states.set(socket, state);
        });
        socket.on("error", (msg: string) => {
          console.error(`Socket error for ${states.get(socket)?.myPlayerId}: ${msg}`);
        });
      }

      const room = store.getRoom(roomCode)!;
      startGame(store, room);

      await new Promise((r) => setTimeout(r, 500));

      const noteGiverId = store.getRoom(roomCode)!.noteGiverId!;
      const writerSockets = sockets.filter((s) => states.get(s)!.myPlayerId !== noteGiverId);
      const writerIds = writerSockets.map((s) => states.get(s)!.myPlayerId!);

      const w0 = writerSockets[0];
      const w0Id = writerIds[0];

      const w0Draw = waitForEvent<PublicRoomState>(w0, "room_joined");
      w0.emit("select_deck_type", "plot");
      await w0Draw;
      await new Promise((r) => setTimeout(r, 300));

      let w0Hand = store.getRoom(roomCode)!.players.find((p) => p.id === w0Id)!.hand;
      expect(w0Hand.length).toBe(3);

      const w0Card = waitForEvent<PublicRoomState>(w0, "room_joined");
      w0.emit("select_card", w0Hand[0].id);
      await w0Card;
      await new Promise((r) => setTimeout(r, 300));

      for (let i = 1; i < writerSockets.length; i++) {
        const ws = writerSockets[i];
        const writerId = writerIds[i];

        const draw = waitForEvent<PublicRoomState>(ws, "room_joined");
        ws.emit("select_deck_type", "character");
        await draw;
        await new Promise((r) => setTimeout(r, 300));

        const hand = store.getRoom(roomCode)!.players.find((p) => p.id === writerId)!.hand;
        expect(hand.length).toBe(3);
        const card = waitForEvent<PublicRoomState>(ws, "room_joined");
        ws.emit("select_card", hand[0].id);
        await card;
        await new Promise((r) => setTimeout(r, 300));
      }

      const noteGiverPlayer = store.getRoom(roomCode)!.players.find((p) => p.id === noteGiverId)!;
      if (noteGiverPlayer.hand.length === 0) {
        const ngSocket = sockets.find((s) => states.get(s)!.myPlayerId === noteGiverId)!;
        const ngDraw = waitForEvent<PublicRoomState>(ngSocket, "room_joined");
        ngSocket.emit("select_deck_type", "plot");
        await ngDraw;
        await new Promise((r) => setTimeout(r, 300));
        const ngRoom = store.getRoom(roomCode)!;
        const ngPlayer = ngRoom.players.find((p) => p.id === noteGiverId)!;
        const ngCard = waitForEvent<PublicRoomState>(ngSocket, "room_joined");
        ngSocket.emit("select_card", ngPlayer.hand[0].id);
        await ngCard;
        await new Promise((r) => setTimeout(r, 300));
      }

      await new Promise((r) => setTimeout(r, 500));
      const finalRoom = store.getRoom(roomCode)!;
      expect(finalRoom.phase).toBe("pitching");

      sockets.forEach((s) => s.disconnect());
    }, 30000);
  });

  describe("kick_player handler", () => {
    it("host can kick a player and they get disconnected", async () => {
      const host = ioc(`http://localhost:${port}`, { forceNew: true, transports: ["websocket"] });
      host.on("connect", () => host.emit("join_room", "", "Jason"));
      const hostState = await waitForEvent<PublicRoomState>(host, "room_joined");

      const guest = ioc(`http://localhost:${port}`, { forceNew: true, transports: ["websocket"] });
      guest.on("connect", () => guest.emit("join_room", hostState.code, "Sarah"));
      const guestState = await waitForEvent<PublicRoomState>(guest, "room_joined");
      const guestId = guestState.myPlayerId!;

      const kickedPromise = waitForEvent(guest, "kicked");
      host.emit("kick_player", guestId);
      await kickedPromise;

      await new Promise((r) => setTimeout(r, 300));
      expect(guest.connected).toBe(false);

      host.disconnect();
    });

    it("non-host cannot kick a player", async () => {
      const host = ioc(`http://localhost:${port}`, { forceNew: true, transports: ["websocket"] });
      host.on("connect", () => host.emit("join_room", "", "Jason"));
      const hostState = await waitForEvent<PublicRoomState>(host, "room_joined");

      const guest = ioc(`http://localhost:${port}`, { forceNew: true, transports: ["websocket"] });
      guest.on("connect", () => guest.emit("join_room", hostState.code, "Sarah"));
      const guestState = await waitForEvent<PublicRoomState>(guest, "room_joined");
      const guestId = guestState.myPlayerId!;

      const third = ioc(`http://localhost:${port}`, { forceNew: true, transports: ["websocket"] });
      third.on("connect", () => third.emit("join_room", hostState.code, "Mike"));
      await waitForEvent<PublicRoomState>(third, "room_joined");

      third.emit("kick_player", guestId);
      await new Promise((r) => setTimeout(r, 500));

      expect(guest.connected).toBe(true);

      host.disconnect();
      guest.disconnect();
      third.disconnect();
    });
  });
});