import type { Server, Socket } from "socket.io";
import type { Room, PublicRoomState, AudienceRoomState } from "@direct-to-video/shared";
import type { RoomStore } from "../rooms.js";
import { logger } from "../logger.js";

const playerSockets = new Map<string, { socketId: string; roomCode: string }>();
const audienceSockets = new Map<string, { socketId: string; roomCode: string }>();

export function countAudience(roomCode: string): number {
  let count = 0;
  for (const info of audienceSockets.values()) {
    if (info.roomCode === roomCode) count++;
  }
  return count;
}

export function computeVoteCounts(room: Room): { playerId: string; votes: number }[] {
  const counts: Record<string, number> = {};
  for (const votedFor of Object.values(room.votes)) {
    counts[votedFor] = (counts[votedFor] || 0) + 1;
  }
  return room.movies
    .filter((m) => m.revealed)
    .map((m) => ({ playerId: m.playerId, votes: counts[m.playerId] || 0 }));
}

export function toPublicRoomState(room: Room, playerId: string | null): PublicRoomState {
  const player = playerId ? room.players.find((p) => p.id === playerId) : null;
  const isNoteGiver = player?.id === room.noteGiverId;
  const myMovie = playerId ? room.movies.find((m) => m.playerId === playerId) : null;
  return {
    code: room.code,
    phase: room.phase,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      isNoteGiver: p.isNoteGiver,
      isHost: p.isHost,
      score: p.score,
      isDisconnected: p.isDisconnected,
      isSpectator: p.isSpectator,
    })),
    noteGiverId: room.noteGiverId,
    currentPitcherId: room.currentPitcherId,
    timer: room.timer,
    round: room.round,
    totalRounds: room.totalRounds,
    movies: room.movies.filter((m) => m.revealed),
    movieHistory: room.movieHistory,
    myPlayerId: playerId,
    myHand: player ? player.hand : null,
    myChosenCard: player ? player.chosenCard : null,
    myMovieReady: !!myMovie,
    myMovieRevealed: myMovie ? myMovie.revealed : false,
    myBlindCard: myMovie && myMovie.revealed ? myMovie.randomCard : null,
    myNoteGiverNotes: isNoteGiver ? room.noteGiverNotes : null,
    votingActive: room.votingActive,
    voteCounts: computeVoteCounts(room),
    myVote: playerId ? room.votes[playerId] || null : null,
    audienceCount: countAudience(room.code),
    roundWinnerId: room.roundWinnerId,
    franchiseEnabled: room.franchiseEnabled,
  };
}

export function toAudienceRoomState(room: Room, audienceSocketId?: string): AudienceRoomState {
  const hasVoted = audienceSocketId ? !!room.votes[audienceSocketId] : false;
  const visibleMovies = room.movies.filter((m) => m.revealed);
  if (room.currentPitcherId) {
    const currentMovie = room.movies.find(
      (m) => m.playerId === room.currentPitcherId && !m.revealed,
    );
    if (currentMovie && !visibleMovies.some((m) => m.playerId === currentMovie.playerId)) {
      visibleMovies.push(currentMovie);
    }
  }
  return {
    code: room.code,
    phase: room.phase,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      isNoteGiver: p.isNoteGiver,
      isHost: p.isHost,
      score: p.score,
      isDisconnected: p.isDisconnected,
      isSpectator: p.isSpectator,
    })),
    noteGiverId: room.noteGiverId,
    currentPitcherId: room.currentPitcherId,
    timer: room.timer,
    round: room.round,
    totalRounds: room.totalRounds,
    movies: visibleMovies,
    movieHistory: room.movieHistory,
    scoreboard: room.players.map((p) => ({ playerId: p.id, name: p.name, score: p.score })),
    votingActive: room.votingActive,
    voteCounts: computeVoteCounts(room),
    hasVoted,
    roundWinnerId: room.roundWinnerId,
    franchiseEnabled: room.franchiseEnabled,
  };
}

export function emitPlayerState(io: Server, socket: Socket, room: Room, playerId: string): void {
  socket.emit("room_joined", toPublicRoomState(room, playerId));
}

export function broadcastPlayerList(io: Server, room: Room): void {
  const players = room.players.map((p) => ({
    id: p.id,
    name: p.name,
    isNoteGiver: p.isNoteGiver,
    isHost: p.isHost,
    score: p.score,
    isDisconnected: p.isDisconnected,
    isSpectator: p.isSpectator,
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

export function broadcastAllStates(io: Server, room: Room): void {
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

export function getPlayerContext(
  socketId: string,
  store: RoomStore,
): { room: Room; playerId: string } | null {
  for (const [playerId, info] of playerSockets) {
    if (info.socketId === socketId) {
      const room = store.getRoom(info.roomCode);
      if (room) return { room, playerId };
    }
  }
  return null;
}

export function findRoomBySocket(socket: Socket, store: RoomStore): Room | null {
  const audienceInfo = audienceSockets.get(socket.id);
  if (audienceInfo) {
    return store.getRoom(audienceInfo.roomCode);
  }
  const ctx = getPlayerContext(socket.id, store);
  return ctx ? ctx.room : null;
}

export function* allRooms(store: RoomStore): Generator<Room> {
  yield* store.getAllCachedRooms();
}

export function setPlayerSocket(playerId: string, socketId: string, roomCode: string): void {
  playerSockets.set(playerId, { socketId, roomCode });
}

export function getPlayerSocketInfo(
  playerId: string,
): { socketId: string; roomCode: string } | undefined {
  return playerSockets.get(playerId);
}

export function deletePlayerSocket(playerId: string): void {
  playerSockets.delete(playerId);
}

export function setAudienceSocket(audienceId: string, socketId: string, roomCode: string): void {
  audienceSockets.set(audienceId, { socketId, roomCode });
}

export function deleteAudienceSocket(audienceId: string): void {
  audienceSockets.delete(audienceId);
}

export function findPlayerIdBySocketId(socketId: string): string | null {
  for (const [playerId, info] of playerSockets) {
    if (info.socketId === socketId) return playerId;
  }
  return null;
}

export function findAudienceSocketBySocketId(
  socketId: string,
): { socketId: string; roomCode: string } | undefined {
  return audienceSockets.get(socketId);
}

export function checkAllVoted(room: Room): boolean {
  const eligiblePlayers = room.players.filter((p) => !p.isDisconnected && p.socketId);
  const eligiblePlayerIds = new Set(eligiblePlayers.map((p) => p.id));
  for (const playerId of eligiblePlayerIds) {
    if (!room.votes[playerId]) return false;
  }
  let audienceCount = 0;
  for (const info of audienceSockets.values()) {
    if (info.roomCode === room.code) audienceCount++;
  }
  let audienceVotes = 0;
  for (const [voterId] of Object.entries(room.votes)) {
    if (eligiblePlayerIds.has(voterId)) continue;
    audienceVotes++;
  }
  return audienceVotes >= audienceCount;
}

export function emitRoundResult(io: Server, room: Room, roundWinnerId: string | null): void {
  io.to(`room:${room.code}`).emit("voting_ended", roundWinnerId);
  io.to(`audience:${room.code}`).emit("voting_ended", roundWinnerId);
  if (room.phase === "game-end") {
    const scoreboard = room.players.map((p) => ({ playerId: p.id, name: p.name, score: p.score }));
    io.to(`room:${room.code}`).emit("game_ended", scoreboard);
    io.to(`audience:${room.code}`).emit("game_ended", scoreboard);
    logger.endGame(room.code, scoreboard);
  } else if (room.phase === "setup") {
    io.to(`room:${room.code}`).emit("round_started", room.round.current);
    io.to(`audience:${room.code}`).emit("round_started", room.round.current);
    const winnerPlayer = roundWinnerId ? room.players.find((p) => p.id === roundWinnerId) : null;
    logger.roundEnd(
      room.code,
      room.round.current,
      room.totalRounds,
      winnerPlayer?.name || "tie/no-winner",
    );
  }
}
