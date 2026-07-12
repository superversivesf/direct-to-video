import type { Server, Socket } from "socket.io";
import type { Room, PublicRoomState, AudienceRoomState, DeckType } from "@pitch-storm/shared";
import { RoomStore, createRoom, joinRoom } from "./rooms.js";
import { logger } from "./logger.js";
import {
  startGame,
  selectDeckType,
  selectCard,
  drawBlindCard,
  revealMovie,
  endPitch,
  playNote,
  selectWinner,
  playAgain,
} from "./state-machine.js";
import { startTimer, pauseTimer, pauseForNote, tickTimer, isTimerExpired, shouldResumeFromNote } from "./timer.js";

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
  };
}

function toAudienceRoomState(room: Room): AudienceRoomState {
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
  io.to(`audience:${room.code}`).emit("audience_update", toAudienceRoomState(room));
}

const playerSockets = new Map<string, { socketId: string; roomCode: string }>();

export function setupSocketHandlers(io: Server, store: RoomStore): void {
  const timerInterval = setInterval(() => {
    for (const room of allRooms(store)) {
      if (room.timer.running) {
        const ticked = tickTimer(room.timer);
        store.saveRoom({ ...room, timer: ticked });
        io.to(`room:${room.code}`).emit("timer_tick", ticked.secondsRemaining);
        io.to(`audience:${room.code}`).emit("audience_update", toAudienceRoomState(store.getRoom(room.code)!));
        if (isTimerExpired(ticked)) {
          io.to(`room:${room.code}`).emit("timer_expired");
          io.to(`audience:${room.code}`).emit("audience_update", toAudienceRoomState(store.getRoom(room.code)!));
          if (room.currentPitcherId) {
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

    socket.on("join_room", (code: string, name: string) => {
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
      logger.joinAudience(clientIp, room.code);
      socket.emit("audience_joined", toAudienceRoomState(room));
    });

    socket.on("start_game", () => {
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
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      try {
        selectCard(store, ctx.room, ctx.playerId, cardId);
        broadcastAllStates(io, store.getRoom(ctx.room.code)!);
      } catch (err) {
        socket.emit("error", (err as Error).message);
      }
    });

    socket.on("draw_random_card", (deckType: DeckType) => {
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      try {
        drawBlindCard(store, ctx.room, ctx.playerId, deckType);
        broadcastAllStates(io, store.getRoom(ctx.room.code)!);
      } catch (err) {
        socket.emit("error", (err as Error).message);
      }
    });

    socket.on("reveal_movie", () => {
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
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      if (ctx.playerId !== ctx.room.executiveId) return;
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
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      if (ctx.playerId !== ctx.room.executiveId) return;
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

    socket.on("play_again", () => {
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
      for (const [playerId, info] of playerSockets) {
        if (info.socketId === socket.id) {
          const room = store.getRoom(info.roomCode);
          if (room) {
            const updated = {
              ...room,
              players: room.players.map((p) =>
                p.id === playerId ? { ...p, isDisconnected: true, socketId: null } : p
              ),
            };
            store.saveRoom(updated);
            broadcastPlayerList(io, updated);
          }
          playerSockets.delete(playerId);
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

function broadcastAllStates(io: Server, room: Room): void {
  for (const player of room.players) {
    if (player.socketId) {
      const socket = io.sockets.sockets.get(player.socketId);
      if (socket) {
        emitPlayerState(io, socket, room, player.id);
      }
    }
  }
  io.to(`audience:${room.code}`).emit("audience_update", toAudienceRoomState(room));
}

function* allRooms(store: RoomStore): Generator<Room> {
  yield* store.getAllCachedRooms();
}