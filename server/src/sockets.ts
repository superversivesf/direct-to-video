import type { Server, Socket } from "socket.io";
import type { Room, PublicRoomState, AudienceRoomState, DeckType } from "@direct-to-video/shared";
import { RoomStore, createRoom, joinRoom, validateName } from "./rooms.js";
import { logger } from "./logger.js";
import {
  startGame,
  selectDeckType,
  selectCard,
  revealMovie,
  endPitch,
  playNote,
  selectWinner,
  playAgain,
  startVoting,
  castVote,
  endVoting,
} from "./state-machine.js";
import { startTimer, pauseTimer, pauseForNote, tickTimer, isTimerExpired, shouldResumeFromNote } from "./timer.js";

const MAX_CONNECTIONS_PER_IP = 100;
const MAX_JOIN_ATTEMPTS_PER_IP = 20;
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

function checkConnectionLimit(socket: Socket): boolean {
  const ip = getIp(socket);
  const count = connectionsPerIp.get(ip) || 0;
  if (count >= MAX_CONNECTIONS_PER_IP) return false;
  connectionsPerIp.set(ip, count + 1);
  return true;
}

function releaseConnection(socket: Socket): void {
  const ip = getIp(socket);
  const count = connectionsPerIp.get(ip) || 0;
  if (count <= 1) {
    connectionsPerIp.delete(ip);
  } else {
    connectionsPerIp.set(ip, count - 1);
  }
}

function checkJoinRateLimit(socket: Socket): boolean {
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

function checkSocketEventRate(socket: Socket): boolean {
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

function toPublicRoomState(room: Room, playerId: string | null): PublicRoomState {
  const player = playerId ? room.players.find((p) => p.id === playerId) : null;
  const isExec = player?.id === room.executiveId;
  const myMovie = playerId ? room.movies.find((m) => m.playerId === playerId) : null;
  return {
    code: room.code,
    phase: room.phase,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      isExecutive: p.isExecutive,
      isHost: p.isHost,
      score: p.score,
      isDisconnected: p.isDisconnected,
    })),
    executiveId: room.executiveId,
    currentPitcherId: room.currentPitcherId,
    timer: room.timer,
    round: room.round,
    movies: room.movies.filter((m) => m.revealed),
    myPlayerId: playerId,
    myHand: player ? player.hand : null,
    myChosenCard: player ? player.chosenCard : null,
    myMovieReady: !!myMovie,
    myMovieRevealed: myMovie ? myMovie.revealed : false,
    myBlindCard: myMovie && myMovie.revealed ? myMovie.randomCard : null,
    myExecutiveNotes: isExec ? room.executiveNotes : null,
    votingActive: room.votingActive,
    voteCounts: computeVoteCounts(room),
    myVote: playerId ? room.votes[playerId] || null : null,
    audienceCount: countAudience(room.code),
  };
}

function toAudienceRoomState(room: Room, audienceSocketId?: string): AudienceRoomState {
  const hasVoted = audienceSocketId ? !!room.votes[audienceSocketId] : false;
  return {
    code: room.code,
    phase: room.phase,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      isExecutive: p.isExecutive,
      isHost: p.isHost,
      score: p.score,
      isDisconnected: p.isDisconnected,
    })),
    executiveId: room.executiveId,
    currentPitcherId: room.currentPitcherId,
    timer: room.timer,
    round: room.round,
    movies: room.movies.filter((m) => m.revealed),
    scoreboard: room.players.map((p) => ({ playerId: p.id, name: p.name, score: p.score })),
    votingActive: room.votingActive,
    voteCounts: computeVoteCounts(room),
    hasVoted,
  };
}

function emitPlayerState(io: Server, socket: Socket, room: Room, playerId: string): void {
  socket.emit("room_joined", toPublicRoomState(room, playerId));
}

function broadcastPlayerList(io: Server, room: Room): void {
  const players = room.players.map((p) => ({
    id: p.id,
    name: p.name,
    isExecutive: p.isExecutive,
    isHost: p.isHost,
    score: p.score,
    isDisconnected: p.isDisconnected,
  }));
  io.to(`room:${room.code}`).emit("player_list_updated", players);
  for (const [audienceId, info] of audienceSockets) {
    if (info.roomCode === room.code) {
      const socket = io.sockets.sockets.get(info.socketId);
      if (socket) {
        socket.emit("audience_update", toAudienceRoomState(room, audienceId));
      }
    }
  }
}

const playerSockets = new Map<string, { socketId: string; roomCode: string }>();
const audienceSockets = new Map<string, { socketId: string; roomCode: string }>();

function countAudience(roomCode: string): number {
  let count = 0;
  for (const info of audienceSockets.values()) {
    if (info.roomCode === roomCode) count++;
  }
  return count;
}

function computeVoteCounts(room: Room): { playerId: string; votes: number }[] {
  const counts: Record<string, number> = {};
  for (const [voterId, votedFor] of Object.entries(room.votes)) {
    const weight = voterId === room.executiveId ? 2 : 1;
    counts[votedFor] = (counts[votedFor] || 0) + weight;
  }
  return room.movies
    .filter((m) => m.revealed)
    .map((m) => ({ playerId: m.playerId, votes: counts[m.playerId] || 0 }));
}

export function setupSocketHandlers(io: Server, store: RoomStore): void {
  const timerInterval = setInterval(() => {
    for (const room of allRooms(store)) {
      if (room.timer.running) {
        const ticked = tickTimer(room.timer);
        store.saveRoom({ ...room, timer: ticked });
        io.to(`room:${room.code}`).emit("timer_tick", ticked.secondsRemaining);
        broadcastAllStates(io, store.getRoom(room.code)!);
        if (isTimerExpired(ticked)) {
          io.to(`room:${room.code}`).emit("timer_expired");
          if (room.votingActive) {
            const updated = store.getRoom(room.code)!;
            const winnerId = endVoting(store, updated);
            const postVote = store.getRoom(room.code)!;
            io.to(`room:${postVote.code}`).emit("voting_ended", winnerId);
            if (postVote.phase === "game-end") {
              const scoreboard = postVote.players.map((p) => ({ playerId: p.id, name: p.name, score: p.score }));
              io.to(`room:${postVote.code}`).emit("game_ended", scoreboard);
              io.to(`audience:${postVote.code}`).emit("game_ended", scoreboard);
              logger.endGame(postVote.code, scoreboard);
            } else if (postVote.phase === "setup") {
              io.to(`room:${postVote.code}`).emit("round_started", postVote.round.current);
            }
            broadcastAllStates(io, postVote);
          } else if (room.currentPitcherId) {
            endPitch(store, store.getRoom(room.code)!, room.currentPitcherId);
            const updated = store.getRoom(room.code)!;
            io.to(`room:${updated.code}`).emit("pitch_ended", room.currentPitcherId);
            io.to(`audience:${updated.code}`).emit("pitch_ended", room.currentPitcherId);
            if (updated.currentPitcherId) {
              io.to(`room:${updated.code}`).emit("next_pitcher", updated.currentPitcherId);
              io.to(`audience:${updated.code}`).emit("next_pitcher", updated.currentPitcherId);
            }
            if (updated.phase === "setup" && updated.round.current > 1) {
              io.to(`room:${updated.code}`).emit("round_started", updated.round.current);
              io.to(`audience:${updated.code}`).emit("round_started", updated.round.current);
            }
            broadcastAllStates(io, updated);
          }
        }
      } else if (shouldResumeFromNote(room.timer)) {
        const resumed = startTimer(room.timer);
        store.saveRoom({ ...room, timer: resumed });
        io.to(`room:${room.code}`).emit("timer_started", resumed.secondsRemaining);
        io.to(`audience:${room.code}`).emit("timer_started", resumed.secondsRemaining);
      }
    }
  }, 1000);

  io.engine.on("close", () => {
    clearInterval(timerInterval);
  });

  io.on("connection", (socket: Socket) => {
    const clientIp = socket.handshake.address;
    logger.connect(clientIp, socket.id);

    if (!checkConnectionLimit(socket)) {
      logger.error(clientIp, socket.id, "Connection limit exceeded for IP");
      socket.emit("error", "Too many connections from your address");
      socket.disconnect();
      return;
    }

    socket.on("join_room", (code: string, name: string) => {
      if (!checkJoinRateLimit(socket)) {
        logger.error(clientIp, socket.id, "Join rate limit exceeded");
        socket.emit("error", "Too many join attempts. Please wait a minute and try again.");
        return;
      }
      try {
        let room: Room;
        let playerId: string;
        let isHost = false;
        if (!code) {
          const result = createRoom(store, name);
          room = result.room;
          playerId = result.playerId;
          isHost = true;
        } else {
          const result = joinRoom(store, code.toUpperCase(), name);
          room = result.room;
          playerId = result.playerId;
        }
        socket.join(`room:${room.code}`);
        playerSockets.set(playerId, { socketId: socket.id, roomCode: room.code });
        room = store.getRoom(room.code)!;
        room = {
          ...room,
          players: room.players.map((p) =>
            p.id === playerId ? { ...p, socketId: socket.id, isDisconnected: false } : p
          ),
        };
        store.saveRoom(room);
        logger.joinRoom(clientIp, room.code, name, isHost);
        emitPlayerState(io, socket, room, playerId);
        broadcastPlayerList(io, room);
      } catch (err) {
        logger.error(clientIp, socket.id, (err as Error).message);
        socket.emit("error", (err as Error).message);
      }
    });

    socket.on("join_audience", (code: string) => {
      const normalizedCode = code.toUpperCase();
      if (!/^[A-Z]{4}$/.test(normalizedCode)) {
        socket.emit("error", "Invalid room code");
        return;
      }
      const room = store.getRoom(normalizedCode);
      if (!room) {
        socket.emit("error", "Room not found");
        return;
      }
      socket.join(`audience:${room.code}`);
      const audienceId = socket.id;
      audienceSockets.set(audienceId, { socketId: socket.id, roomCode: room.code });
      logger.joinAudience(clientIp, room.code);
      socket.emit("audience_joined", toAudienceRoomState(room, audienceId));
    });

    socket.on("start_game", () => {
      if (!checkSocketEventRate(socket)) return;
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      try {
        startGame(store, ctx.room);
        const updated = store.getRoom(ctx.room.code)!;
        logger.startGame(updated.code, updated.players.length);
        broadcastAllStates(io, updated);
      } catch (err) {
        socket.emit("error", (err as Error).message);
      }
    });

    socket.on("select_deck_type", (deckType: DeckType) => {
      if (!checkSocketEventRate(socket)) return;
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      try {
        selectDeckType(store, ctx.room, ctx.playerId, deckType);
        broadcastAllStates(io, store.getRoom(ctx.room.code)!);
      } catch (err) {
        socket.emit("error", (err as Error).message);
      }
    });

    socket.on("select_card", (cardId: string) => {
      if (!checkSocketEventRate(socket)) return;
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      try {
        selectCard(store, ctx.room, ctx.playerId, cardId);
        broadcastAllStates(io, store.getRoom(ctx.room.code)!);
      } catch (err) {
        socket.emit("error", (err as Error).message);
      }
    });

    socket.on("reveal_movie", () => {
      if (!checkSocketEventRate(socket)) return;
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      try {
        revealMovie(store, ctx.room, ctx.playerId);
        const updated = store.getRoom(ctx.room.code)!;
        const movie = updated.movies.find((m) => m.playerId === ctx.playerId);
        if (movie) {
          io.to(`room:${updated.code}`).emit("movie_revealed", movie);
          io.to(`audience:${updated.code}`).emit("movie_revealed", movie);
        }
      } catch (err) {
        socket.emit("error", (err as Error).message);
      }
    });

    socket.on("start_timer", () => {
      if (!checkSocketEventRate(socket)) return;
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      if (ctx.playerId !== ctx.room.executiveId) return;
      try {
        let room = ctx.room;
        if (room.currentPitcherId) {
          const movie = room.movies.find((m) => m.playerId === room.currentPitcherId);
          if (movie && !movie.revealed) {
            revealMovie(store, room, room.currentPitcherId);
            room = store.getRoom(room.code)!;
            const revealedMovie = room.movies.find((m) => m.playerId === room.currentPitcherId);
            if (revealedMovie) {
              io.to(`room:${room.code}`).emit("movie_revealed", revealedMovie);
              io.to(`audience:${room.code}`).emit("movie_revealed", revealedMovie);
            }
          }
        }
        const updated = { ...(room as Room), timer: startTimer((room as Room).timer) };
        store.saveRoom(updated);
        io.to(`room:${updated.code}`).emit("timer_started", updated.timer.secondsRemaining);
        io.to(`audience:${updated.code}`).emit("timer_started", updated.timer.secondsRemaining);
      } catch (err) {
        socket.emit("error", (err as Error).message);
      }
    });

    socket.on("pause_timer", () => {
      if (!checkSocketEventRate(socket)) return;
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      if (ctx.playerId !== ctx.room.executiveId) return;
      try {
        const updated = { ...ctx.room, timer: pauseTimer(ctx.room.timer) };
        store.saveRoom(updated);
        io.to(`room:${updated.code}`).emit("timer_paused", updated.timer.secondsRemaining);
        io.to(`audience:${updated.code}`).emit("timer_paused", updated.timer.secondsRemaining);
      } catch (err) {
        socket.emit("error", (err as Error).message);
      }
    });

    socket.on("play_note", (noteCardId: string) => {
      if (!checkSocketEventRate(socket)) return;
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      if (ctx.playerId !== ctx.room.executiveId) return;
      if (!ctx.room.timer.running && !ctx.room.timer.pausedForNote) return;
      try {
        const noteCard = ctx.room.executiveNotes.find((c) => c.id === noteCardId);
        if (!noteCard) throw new Error("Note card not in Executive's hand");
        const pitcherId = ctx.room.currentPitcherId!;
        playNote(store, ctx.room, noteCardId, pitcherId);
        let updated = store.getRoom(ctx.room.code)!;
        if (updated.timer.running) {
          const paused = pauseForNote(updated.timer, 5);
          store.saveRoom({ ...updated, timer: paused });
          updated = store.getRoom(ctx.room.code)!;
          io.to(`room:${updated.code}`).emit("timer_paused", updated.timer.secondsRemaining);
          io.to(`audience:${updated.code}`).emit("timer_paused", updated.timer.secondsRemaining);
        }
        io.to(`room:${updated.code}`).emit("note_played", noteCard, pitcherId);
        io.to(`audience:${updated.code}`).emit("note_played", noteCard, pitcherId);
        broadcastAllStates(io, updated);
      } catch (err) {
        socket.emit("error", (err as Error).message);
      }
    });

    socket.on("end_pitch", () => {
      if (!checkSocketEventRate(socket)) return;
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      const isExecutive = ctx.playerId === ctx.room.executiveId;
      const isCurrentPitcher = ctx.playerId === ctx.room.currentPitcherId;
      if (!isExecutive && !isCurrentPitcher) return;
      try {
        endPitch(store, ctx.room, ctx.room.currentPitcherId!);
        const updated = store.getRoom(ctx.room.code)!;
        io.to(`room:${updated.code}`).emit("pitch_ended", ctx.room.currentPitcherId!);
        io.to(`audience:${updated.code}`).emit("pitch_ended", ctx.room.currentPitcherId!);
        if (updated.currentPitcherId) {
          io.to(`room:${updated.code}`).emit("next_pitcher", updated.currentPitcherId);
          io.to(`audience:${updated.code}`).emit("next_pitcher", updated.currentPitcherId);
        }
        broadcastAllStates(io, updated);
      } catch (err) {
        socket.emit("error", (err as Error).message);
      }
    });

    socket.on("select_winner", (playerId: string) => {
      if (!checkSocketEventRate(socket)) return;
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      if (ctx.playerId !== ctx.room.executiveId) return;
      try {
        selectWinner(store, ctx.room, playerId);
        const updated = store.getRoom(ctx.room.code)!;
        const winnerNote = updated.movies.find((m) => m.playerId === playerId)?.notesPlayed.slice(-1)[0] || null;
        const winnerPlayer = updated.players.find((p) => p.id === playerId);
        io.to(`room:${updated.code}`).emit("winner_selected", playerId, winnerNote);
        io.to(`audience:${updated.code}`).emit("winner_selected", playerId, winnerNote);
        if (updated.phase === "game-end") {
          const scoreboard = updated.players.map((p) => ({ playerId: p.id, name: p.name, score: p.score }));
          io.to(`room:${updated.code}`).emit("game_ended", scoreboard);
          io.to(`audience:${updated.code}`).emit("game_ended", scoreboard);
          logger.endGame(updated.code, scoreboard);
        } else if (updated.phase === "setup" && updated.round.current > ctx.room.round.current) {
          io.to(`room:${updated.code}`).emit("round_started", updated.round.current);
          io.to(`audience:${updated.code}`).emit("round_started", updated.round.current);
          logger.roundEnd(updated.code, updated.round.current, updated.round.total, winnerPlayer?.name || "unknown");
        }
        broadcastAllStates(io, updated);
      } catch (err) {
        socket.emit("error", (err as Error).message);
      }
    });

    socket.on("start_voting", () => {
      if (!checkSocketEventRate(socket)) return;
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      if (ctx.playerId !== ctx.room.executiveId) return;
      try {
        startVoting(store, ctx.room);
        const updated = store.getRoom(ctx.room.code)!;
        const started = startTimer(updated.timer);
        store.saveRoom({ ...updated, timer: started });
        io.to(`room:${updated.code}`).emit("voting_started", started.secondsRemaining);
        broadcastAllStates(io, store.getRoom(updated.code)!);
      } catch (err) {
        socket.emit("error", (err as Error).message);
      }
    });

    socket.on("cast_vote", (playerId: string) => {
      if (!checkSocketEventRate(socket)) return;
      const room = findRoomBySocket(socket, store);
      if (!room) return;
      if (!room.votingActive) return;
      const playerCtx = getPlayerContext(socket.id, store);
      const voterId = playerCtx ? playerCtx.playerId : socket.id;
      if (room.votes[voterId]) return;
      try {
        castVote(store, room, voterId, playerId);
        const updated = store.getRoom(room.code)!;
        const voteCounts = computeVoteCounts(updated);
        io.to(`room:${updated.code}`).emit("vote_update", voteCounts);
        io.to(`audience:${updated.code}`).emit("vote_update", voteCounts);
        broadcastAllStates(io, updated);
      } catch (err) {
        socket.emit("error", (err as Error).message);
      }
    });

    socket.on("end_voting", () => {
      if (!checkSocketEventRate(socket)) return;
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      if (ctx.playerId !== ctx.room.executiveId) return;
      if (!ctx.room.votingActive) return;
      try {
        const winnerId = endVoting(store, ctx.room);
        const updated = store.getRoom(ctx.room.code)!;
        io.to(`room:${updated.code}`).emit("voting_ended", winnerId);
        const winnerNote = updated.movies.find((m) => m.playerId === winnerId)?.notesPlayed.slice(-1)[0] || null;
        const winnerPlayer = updated.players.find((p) => p.id === winnerId);
        io.to(`room:${updated.code}`).emit("winner_selected", winnerId, winnerNote);
        io.to(`audience:${updated.code}`).emit("winner_selected", winnerId, winnerNote);
        if (updated.phase === "game-end") {
          const scoreboard = updated.players.map((p) => ({ playerId: p.id, name: p.name, score: p.score }));
          io.to(`room:${updated.code}`).emit("game_ended", scoreboard);
          io.to(`audience:${updated.code}`).emit("game_ended", scoreboard);
          logger.endGame(updated.code, scoreboard);
        } else if (updated.phase === "setup" && updated.round.current > ctx.room.round.current) {
          io.to(`room:${updated.code}`).emit("round_started", updated.round.current);
          io.to(`audience:${updated.code}`).emit("round_started", updated.round.current);
          logger.roundEnd(updated.code, updated.round.current, updated.round.total, winnerPlayer?.name || "unknown");
        }
        broadcastAllStates(io, updated);
      } catch (err) {
        socket.emit("error", (err as Error).message);
      }
    });

    socket.on("play_again", () => {
      if (!checkSocketEventRate(socket)) return;
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      const player = ctx.room.players.find((p) => p.id === ctx.playerId);
      if (!player?.isHost) return;
      try {
        playAgain(store, ctx.room);
        broadcastAllStates(io, store.getRoom(ctx.room.code)!);
      } catch (err) {
        socket.emit("error", (err as Error).message);
      }
    });

    socket.on("disconnect", () => {
      logger.disconnect(clientIp, socket.id);
      releaseConnection(socket);
      socketEventCounts.delete(socket.id);
      for (const [playerId, info] of playerSockets) {
        if (info.socketId === socket.id) {
          const room = store.getRoom(info.roomCode);
          if (room) {
            const leavingPlayer = room.players.find((p) => p.id === playerId);
            const wasHost = leavingPlayer?.isHost ?? false;
            let updated = {
              ...room,
              players: room.players.map((p) =>
                p.id === playerId ? { ...p, isDisconnected: true, socketId: null, isHost: false } : p
              ),
            };
            if (wasHost) {
              const nextHost = updated.players.find((p) => !p.isDisconnected && p.id !== playerId);
              if (nextHost) {
                updated = {
                  ...updated,
                  players: updated.players.map((p) =>
                    p.id === nextHost.id ? { ...p, isHost: true } : p
                  ),
                };
              }
            }
            store.saveRoom(updated);
            broadcastPlayerList(io, updated);
            broadcastAllStates(io, updated);
          }
          playerSockets.delete(playerId);
          break;
        }
      }
      for (const [audienceId, info] of audienceSockets) {
        if (info.socketId === socket.id) {
          audienceSockets.delete(audienceId);
          break;
        }
      }
    });
  });
}

function getPlayerContext(socketId: string, store: RoomStore): { room: Room; playerId: string } | null {
  for (const [playerId, info] of playerSockets) {
    if (info.socketId === socketId) {
      const room = store.getRoom(info.roomCode);
      if (room) return { room, playerId };
    }
  }
  return null;
}

function findRoomBySocket(socket: Socket, store: RoomStore): Room | null {
  const audienceInfo = audienceSockets.get(socket.id);
  if (audienceInfo) {
    return store.getRoom(audienceInfo.roomCode);
  }
  const ctx = getPlayerContext(socket.id, store);
  return ctx ? ctx.room : null;
}

function broadcastAllStates(io: Server, room: Room): void {
  for (const player of room.players) {
    if (player.socketId) {
      const socket = io.sockets.sockets.get(player.socketId);
      if (socket) {
        emitPlayerState(io, socket, room, player.id);
      }
    }
  }
  for (const [audienceId, info] of audienceSockets) {
    if (info.roomCode === room.code) {
      const socket = io.sockets.sockets.get(info.socketId);
      if (socket) {
        socket.emit("audience_update", toAudienceRoomState(room, audienceId));
      }
    }
  }
}

function* allRooms(store: RoomStore): Generator<Room> {
  yield* store.getAllCachedRooms();
}
