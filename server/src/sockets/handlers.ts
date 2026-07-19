import type { Server, Socket } from "socket.io";
import type { Room, DeckType } from "@direct-to-video/shared";
import { RoomStore, createRoom, joinRoom } from "../rooms.js";
import { logger } from "../logger.js";
import {
  startGame,
  selectDeckType,
  selectCard,
  revealMovie,
  endPitch,
  playNote,
  castVote,
  tallyAndAdvance,
  playAgain,
  forceStart,
  selectFranchiseSource,
} from "../state-machine.js";
import {
  startTimer,
  pauseTimer,
  pauseForNote,
  tickTimer,
  isTimerExpired,
  shouldResumeFromNote,
} from "../timer.js";
import {
  resetRateLimits,
  checkConnectionLimit,
  releaseConnection,
  checkJoinRateLimit,
  checkSocketEventRate,
  clearSocketEventCount,
} from "./rate-limits.js";
import {
  toAudienceRoomState,
  emitPlayerState,
  broadcastPlayerList,
  broadcastAllStates,
  getPlayerContext,
  findRoomBySocket,
  allRooms,
  setPlayerSocket,
  deletePlayerSocket,
  setAudienceSocket,
  deleteAudienceSocket,
  findPlayerIdBySocketId,
  findAudienceSocketBySocketId,
  checkAllVoted,
  emitRoundResult,
  computeVoteCounts,
  getPlayerSocketInfo,
} from "./state-mapper.js";

export { resetRateLimits };

const STALE_DISCONNECT_MS = 60 * 1000;
const staleDisconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function clearStaleDisconnectTimers(): void {
  for (const timer of staleDisconnectTimers.values()) {
    clearTimeout(timer);
  }
  staleDisconnectTimers.clear();
}

let activeTimerInterval: ReturnType<typeof setInterval> | null = null;

export function clearTimerInterval(): void {
  if (activeTimerInterval !== null) {
    clearInterval(activeTimerInterval);
    activeTimerInterval = null;
  }
}

export function setupSocketHandlers(io: Server, store: RoomStore): void {
  if (activeTimerInterval !== null) {
    clearInterval(activeTimerInterval);
  }
  activeTimerInterval = setInterval(() => {
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
            tallyAndAdvance(store, updated);
            const postVote = store.getRoom(updated.code)!;
            emitRoundResult(io, postVote, postVote.roundWinnerId);
            broadcastAllStates(io, postVote);
          } else if (room.currentPitcherId) {
            endPitch(store, store.getRoom(room.code)!, room.currentPitcherId);
            let updated = store.getRoom(room.code)!;
            io.to(`room:${updated.code}`).emit("pitch_ended", room.currentPitcherId);
            io.to(`audience:${updated.code}`).emit("pitch_ended", room.currentPitcherId);
            if (updated.currentPitcherId) {
              io.to(`room:${updated.code}`).emit("next_pitcher", updated.currentPitcherId);
              io.to(`audience:${updated.code}`).emit("next_pitcher", updated.currentPitcherId);
            }
            if (updated.phase === "round-end" && updated.votingActive) {
              updated = store.getRoom(updated.code)!;
              const started = startTimer(updated.timer);
              store.saveRoom({ ...updated, timer: started });
              io.to(`room:${updated.code}`).emit("voting_started", started.secondsRemaining);
              io.to(`audience:${updated.code}`).emit("voting_started", started.secondsRemaining);
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
    if (activeTimerInterval !== null) {
      clearInterval(activeTimerInterval);
      activeTimerInterval = null;
    }
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
        setPlayerSocket(playerId, socket.id, room.code);
        const staleTimer = staleDisconnectTimers.get(playerId);
        if (staleTimer) {
          clearTimeout(staleTimer);
          staleDisconnectTimers.delete(playerId);
        }
        room = store.getRoom(room.code)!;
        const rejoiningPlayer = room.players.find((p) => p.id === playerId);
        const wasDisconnected = rejoiningPlayer?.isDisconnected ?? false;
        let becomeSpectator = false;
        if (wasDisconnected && room.phase === "pitching") {
          const pitchIndex = room.pitchOrder.findIndex((id) => id === playerId);
          if (pitchIndex >= 0 && pitchIndex < room.currentPitchIndex) {
            becomeSpectator = true;
          }
        }
        room = {
          ...room,
          players: room.players.map((p) =>
            p.id === playerId
              ? {
                  ...p,
                  socketId: socket.id,
                  isDisconnected: false,
                  isSpectator: becomeSpectator ? true : p.isSpectator,
                }
              : p,
          ),
          movies: becomeSpectator
            ? room.movies.filter((m) => m.playerId !== playerId)
            : room.movies,
          pitchOrder: becomeSpectator
            ? room.pitchOrder.filter((id) => id !== playerId)
            : room.pitchOrder,
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
      setAudienceSocket(audienceId, socket.id, room.code);
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

    socket.on("set_franchise_enabled", (enabled: boolean) => {
      if (!checkSocketEventRate(socket)) return;
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      const player = ctx.room.players.find((p) => p.id === ctx.playerId);
      if (!player?.isHost) return;
      if (ctx.room.phase !== "lobby") return;
      try {
        store.saveRoom({ ...ctx.room, franchiseEnabled: !!enabled });
        broadcastAllStates(io, store.getRoom(ctx.room.code)!);
      } catch (err) {
        socket.emit("error", (err as Error).message);
      }
    });

    socket.on("set_total_rounds", (rounds: number) => {
      if (!checkSocketEventRate(socket)) return;
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      const player = ctx.room.players.find((p) => p.id === ctx.playerId);
      if (!player?.isHost) return;
      if (ctx.room.phase !== "lobby") return;
      if (!Number.isInteger(rounds) || rounds < 1 || rounds > 20) return;
      try {
        store.saveRoom({ ...ctx.room, totalRounds: rounds });
        broadcastAllStates(io, store.getRoom(ctx.room.code)!);
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
      if (ctx.playerId !== ctx.room.noteGiverId) return;
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
      if (ctx.playerId !== ctx.room.noteGiverId) return;
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
      if (ctx.playerId !== ctx.room.noteGiverId) return;
      if (!ctx.room.timer.running && !ctx.room.timer.pausedForNote) return;
      try {
        const noteCard = ctx.room.noteGiverNotes.find((c) => c.id === noteCardId);
        if (!noteCard) throw new Error("Note card not in note-giver's hand");
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
      const isNoteGiver = ctx.playerId === ctx.room.noteGiverId;
      const isCurrentPitcher = ctx.playerId === ctx.room.currentPitcherId;
      if (!isNoteGiver && !isCurrentPitcher) return;
      try {
        endPitch(store, ctx.room, ctx.room.currentPitcherId!);
        let updated = store.getRoom(ctx.room.code)!;
        io.to(`room:${updated.code}`).emit("pitch_ended", ctx.room.currentPitcherId!);
        io.to(`audience:${updated.code}`).emit("pitch_ended", ctx.room.currentPitcherId!);
        if (updated.currentPitcherId) {
          io.to(`room:${updated.code}`).emit("next_pitcher", updated.currentPitcherId);
          io.to(`audience:${updated.code}`).emit("next_pitcher", updated.currentPitcherId);
        }
        if (updated.phase === "round-end" && updated.votingActive) {
          updated = store.getRoom(updated.code)!;
          const started = startTimer(updated.timer);
          store.saveRoom({ ...updated, timer: started });
          io.to(`room:${updated.code}`).emit("voting_started", started.secondsRemaining);
          io.to(`audience:${updated.code}`).emit("voting_started", started.secondsRemaining);
        }
        broadcastAllStates(io, updated);
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

        if (checkAllVoted(updated)) {
          tallyAndAdvance(store, updated);
          const postVote = store.getRoom(updated.code)!;
          emitRoundResult(io, postVote, postVote.roundWinnerId);
          broadcastAllStates(io, postVote);
        } else {
          broadcastAllStates(io, updated);
        }
      } catch (err) {
        socket.emit("error", (err as Error).message);
      }
    });

    socket.on("kick_player", (playerId: string) => {
      if (!checkSocketEventRate(socket)) return;
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      const player = ctx.room.players.find((p) => p.id === ctx.playerId);
      if (!player?.isHost) return;
      const targetPlayer = ctx.room.players.find((p) => p.id === playerId);
      if (!targetPlayer) return;
      try {
        const wasHost = targetPlayer.isHost;
        const wasNoteGiver = ctx.room.noteGiverId === playerId;
        const targetSocketId = targetPlayer.socketId;

        const updated: Room = {
          ...ctx.room,
          players: ctx.room.players.filter((p) => p.id !== playerId),
        };

        if (wasNoteGiver) {
          const connectedPlayers = updated.players.filter((p) => !p.isDisconnected);
          if (connectedPlayers.length > 0) {
            updated.noteGiverId = connectedPlayers[0].id;
            updated.players = updated.players.map((p) => ({
              ...p,
              isNoteGiver: p.id === updated.noteGiverId,
            }));
          } else {
            updated.noteGiverId = null;
          }
        }

        if (wasHost) {
          const nextHost = updated.players.find((p) => !p.isDisconnected);
          if (nextHost) {
            updated.players = updated.players.map((p) => ({
              ...p,
              isHost: p.id === nextHost.id,
            }));
          }
        }

        if (playerId === ctx.playerId) return;

        store.saveRoom(updated);
        deletePlayerSocket(playerId);

        if (targetSocketId) {
          const targetSocket = io.sockets.sockets.get(targetSocketId);
          if (targetSocket) {
            targetSocket.emit("kicked");
            targetSocket.disconnect();
          }
        }

        const finalRoom = store.getRoom(updated.code)!;
        broadcastPlayerList(io, finalRoom);
        broadcastAllStates(io, finalRoom);
      } catch (err) {
        socket.emit("error", (err as Error).message);
      }
    });

    socket.on("force_start", () => {
      if (!checkSocketEventRate(socket)) return;
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      try {
        const player = ctx.room.players.find((p) => p.id === ctx.playerId);
        if (!player?.isHost) {
          socket.emit("error", "Only the host can force-start");
          return;
        }
        forceStart(store, ctx.room);
        broadcastAllStates(io, store.getRoom(ctx.room.code)!);
      } catch (err) {
        socket.emit("error", (err as Error).message);
      }
    });

    socket.on("select_franchise_source", (sourceMovieId: string) => {
      if (!checkSocketEventRate(socket)) return;
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      try {
        selectFranchiseSource(store, ctx.room, ctx.playerId, sourceMovieId);
        broadcastAllStates(io, store.getRoom(ctx.room.code)!);
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
      clearSocketEventCount(socket.id);
      const playerId = findPlayerIdBySocketId(socket.id);
      if (playerId) {
        const socketInfo = getPlayerSocketInfo(playerId);
        if (socketInfo) {
          const room = store.getRoom(socketInfo.roomCode);
          if (room) {
            const leavingPlayer = room.players.find((p) => p.id === playerId);
            const wasHost = leavingPlayer?.isHost ?? false;
            let updated = {
              ...room,
              players: room.players.map((p) =>
                p.id === playerId
                  ? { ...p, isDisconnected: true, socketId: null, isHost: false }
                  : p,
              ),
            };
            if (wasHost) {
              const nextHost = updated.players.find((p) => !p.isDisconnected && p.id !== playerId);
              if (nextHost) {
                updated = {
                  ...updated,
                  players: updated.players.map((p) =>
                    p.id === nextHost.id ? { ...p, isHost: true } : p,
                  ),
                };
              }
            }
            store.saveRoom(updated);
            broadcastPlayerList(io, updated);
            broadcastAllStates(io, updated);

            staleDisconnectTimers.set(
              playerId,
              setTimeout(() => {
                staleDisconnectTimers.delete(playerId);
                const currentRoom = store.getRoom(socketInfo.roomCode);
                if (!currentRoom) return;
                const stillDisconnected = currentRoom.players.find(
                  (p) => p.id === playerId && p.isDisconnected,
                );
                if (!stillDisconnected) return;

                const wasNoteGiver = currentRoom.noteGiverId === playerId;
                let cleared = {
                  ...currentRoom,
                  players: currentRoom.players.filter((p) => p.id !== playerId),
                };
                if (wasNoteGiver && cleared.phase !== "round-end" && cleared.phase !== "game-end") {
                  const nextGiver = cleared.players.find((p) => !p.isDisconnected);
                  if (nextGiver) {
                    cleared = {
                      ...cleared,
                      noteGiverId: nextGiver.id,
                      noteGiverNotes: cleared.noteGiverNotes,
                      players: cleared.players.map((p) =>
                        p.id === nextGiver.id
                          ? { ...p, isNoteGiver: true }
                          : { ...p, isNoteGiver: false },
                      ),
                    };
                  }
                }
                if (cleared.players.length > 0 && !cleared.players.some((p) => p.isHost)) {
                  const nextHost = cleared.players.find((p) => !p.isDisconnected);
                  if (nextHost) {
                    cleared = {
                      ...cleared,
                      players: cleared.players.map((p) =>
                        p.id === nextHost.id ? { ...p, isHost: true } : p,
                      ),
                    };
                  }
                }
                store.saveRoom(cleared);
                broadcastPlayerList(io, cleared);
                broadcastAllStates(io, cleared);
                deletePlayerSocket(playerId);
              }, STALE_DISCONNECT_MS),
            );
          }
          deletePlayerSocket(playerId);
        }
      }
      const audienceInfo = findAudienceSocketBySocketId(socket.id);
      if (audienceInfo) {
        deleteAudienceSocket(socket.id);
      }
    });
  });
}
