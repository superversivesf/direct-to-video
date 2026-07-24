import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import type { PublicRoomState, AudienceRoomState, DeckType } from "@direct-to-video/shared";

const TARGET = process.env.STRESS_TARGET || "http://localhost:3000";
const NUM_PLAYERS = parseInt(process.env.STRESS_PLAYERS || "10", 10);
const NUM_ROUNDS = parseInt(process.env.STRESS_ROUNDS || "3", 10);
const NUM_AUDIENCE = parseInt(process.env.STRESS_AUDIENCE || "0", 10);

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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function waitForState(socket: ClientSocket, timeout = 10000): Promise<PublicRoomState> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timeout waiting for room_joined")), timeout);
    const handler = (state: PublicRoomState) => {
      clearTimeout(timer);
      socket.off("room_joined", handler);
      resolve(state);
    };
    socket.on("room_joined", handler);
  });
}

function waitForPhase(
  socket: ClientSocket,
  phase: string,
  timeout = 15000,
): Promise<PublicRoomState> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout waiting for phase ${phase}`)),
      timeout,
    );
    const handler = (state: PublicRoomState) => {
      if (state.phase === phase) {
        clearTimeout(timer);
        socket.off("room_joined", handler);
        resolve(state);
      }
    };
    socket.on("room_joined", handler);
  });
}

function waitForHand(
  socket: ClientSocket,
  getState: () => PublicRoomState | null,
  timeout = 30000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const state = getState();
      if (state && state.myHand && state.myHand.length > 0) {
        resolve();
        return;
      }
      if (Date.now() - start > timeout) {
        reject(new Error("Timeout waiting for hand"));
        return;
      }
      setTimeout(check, 100);
    };
    check();
  });
}

function waitForMovieReady(
  socket: ClientSocket,
  getState: () => PublicRoomState | null,
  timeout = 10000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const state = getState();
      if (state && state.myMovieReady) {
        resolve();
        return;
      }
      if (Date.now() - start > timeout) {
        reject(new Error("Timeout waiting for movie ready"));
        return;
      }
      setTimeout(check, 100);
    };
    check();
  });
}

function waitForPhaseAll(players: Player[], phase: string, timeout = 15000): Promise<void> {
  return Promise.all(
    players.map((p) => {
      if (p.state?.phase === phase) return Promise.resolve();
      return waitForPhase(p.socket, phase, timeout);
    }),
  ).then(() => {});
}

function connectPlayer(target: string, roomCode: string, name: string): Promise<Player> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(target, { forceNew: true, transports: ["websocket"] });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`Timeout connecting ${name}`));
    }, 15000);

    socket.on("room_joined", (state: PublicRoomState) => {
      clearTimeout(timer);
      resolve({ name, socket, playerId: state.myPlayerId!, roomCode: state.code, state });
    });

    socket.on("connect", () => {
      socket.emit("join_room", roomCode, name);
    });

    socket.on("error", (msg: string) => {
      clearTimeout(timer);
      reject(new Error(`${name} error: ${msg}`));
    });
  });
}

function connectAudience(target: string, roomCode: string, name: string): Promise<AudienceMember> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(target, { forceNew: true, transports: ["websocket"] });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`Timeout connecting audience ${name}`));
    }, 15000);

    socket.on("audience_joined", (state: AudienceRoomState) => {
      clearTimeout(timer);
      resolve({ name, socket, state });
    });

    socket.on("connect", () => {
      socket.emit("join_audience", roomCode);
    });

    socket.on("error", (msg: string) => {
      clearTimeout(timer);
      reject(new Error(`Audience ${name} error: ${msg}`));
    });
  });
}

function printBanner(text: string): void {
  const line = "=".repeat(60);
  console.log(`\n${line}\n${text}\n${line}`);
}

async function runGame(
  target: string,
  numPlayers: number,
  numRounds: number,
  numAudience: number,
): Promise<void> {
  printBanner(
    `STRESS TEST: ${numPlayers} players, ${numAudience} audience, ${numRounds} rounds, target ${target}`,
  );

  const players: Player[] = [];
  const audienceMembers: AudienceMember[] = [];
  let roomCode = "";

  // Phase 1: Connect all players
  printBanner("PHASE 1: Connecting players");
  for (let i = 0; i < numPlayers; i++) {
    const name = `Player${i + 1}`;
    const code = i === 0 ? "" : roomCode;
    try {
      const player = await connectPlayer(target, code, name);
      if (i === 0) roomCode = player.roomCode;
      players.push(player);
      console.log(`  [OK] ${name} joined room ${player.roomCode}`);
    } catch (err) {
      console.error(`  [FAIL] ${name}: ${(err as Error).message}`);
      throw err;
    }
    await sleep(200);
  }

  // Connect audience members
  if (numAudience > 0) {
    printBanner(`PHASE 1b: Connecting ${numAudience} audience members`);
    for (let i = 0; i < numAudience; i++) {
      const name = `Audience${i + 1}`;
      try {
        const audience = await connectAudience(target, roomCode, name);
        audienceMembers.push(audience);
        console.log(`  [OK] ${name} joined room ${roomCode}`);
      } catch (err) {
        console.error(`  [FAIL] ${name}: ${(err as Error).message}`);
        throw err;
      }
      await sleep(100);
    }
  }

  // Subscribe all players to state updates
  for (const p of players) {
    p.socket.on("room_joined", (state: PublicRoomState) => {
      p.state = state;
    });
  }

  // Subscribe audience to state updates
  for (const a of audienceMembers) {
    a.socket.on("audience_update", (state: AudienceRoomState) => {
      a.state = state;
    });
    a.socket.on("vote_update", (voteCounts: { playerId: string; votes: number }[]) => {
      if (a.state) a.state = { ...a.state, voteCounts };
    });
    a.socket.on("voting_started", (secondsRemaining: number) => {
      if (a.state)
        a.state = {
          ...a.state,
          votingActive: true,
          timer: {
            running: true,
            secondsRemaining,
            pausedAt: null,
            pausedForNote: false,
            noteResumeAt: null,
          },
        };
    });
    a.socket.on("voting_ended", (_winnerId: string | null) => {
      if (a.state) a.state = { ...a.state, votingActive: false };
    });
  }

  console.log(
    `\n  All ${players.length} players and ${audienceMembers.length} audience connected to room ${roomCode}`,
  );

  // Phase 2: Start game
  printBanner("PHASE 2: Starting game");
  const host = players[0];
  console.log(`  Host ${host.name} starting game...`);

  const startPromises = players.map((p) => waitForState(p.socket));
  host.socket.emit("start_game");
  await Promise.all(startPromises);
  console.log("  Game started — all players received setup state");

  // Phase 3: Play rounds
  for (let round = 1; round <= numRounds; round++) {
    printBanner(`PHASE 3: Round ${round}`);

    // All players wait for setup phase
    await waitForPhaseAll(players, "setup").catch(() => null);
    await sleep(1000);

    // Re-read state to get current note-giver
    const currentState = players[0].state!;
    const noteGiverId = currentState.noteGiverId;
    const noteGiver = players.find((p) => p.playerId === noteGiverId);
    const writers = players.filter((p) => p.playerId !== noteGiverId);

    console.log(`  Note Giver: ${noteGiver?.name}`);
    console.log(`  Writers: ${writers.map((w) => w.name).join(", ")}`);

    // All players (including note giver) select deck type and cards
    // Note giver is also a writer — they pitch last
    // First: all players select their deck type (hands are cleared each round)
    for (const player of players) {
      const playerState = player.state!;
      if (!playerState.myHand || playerState.myHand.length === 0) {
        const deckType: DeckType = Math.random() < 0.5 ? "plot" : "character";
        console.log(`  ${player.name} selecting deck: ${deckType}`);
        const handPromise = waitForHand(player.socket, () => player.state);
        player.socket.emit("select_deck_type", deckType);
        await handPromise;
      }
    }

    // Then: all players select a card from their hand
    for (const player of players) {
      const deckState = player.state!;
      const cardId = deckState.myHand?.[0]?.id;
      if (cardId) {
        console.log(`  ${player.name} selecting card ${cardId}`);
        const moviePromise = waitForMovieReady(player.socket, () => player.state).catch(
          () => null,
        );
        player.socket.emit("select_card", cardId);
        await moviePromise;
      } else {
        console.log(
          `  ${player.name} has no cards in hand! (phase: ${deckState.phase}, hand: ${deckState.myHand?.length ?? 0})`,
        );
      }
    }

    // Wait for pitching phase
    console.log("  Waiting for pitching phase...");
    await waitForPhaseAll(players, "pitching");
    console.log("  Pitching phase reached");

    const pitchState = players[0].state!;
    // All non-spectator players are pitchers (note-giver pitches last)
    const pitcherIds = pitchState.players
      .filter((p) => !p.isSpectator && !p.isDisconnected)
      .map((p) => p.id);
    console.log(
      `  Pitchers: ${pitcherIds.map((id) => players.find((p) => p.playerId === id)?.name).join(", ")}`,
    );

    // Play through each pitcher
    for (let pi = 0; pi < pitcherIds.length; pi++) {
      const pitcherId = pitcherIds[pi];
      const pitcher = players.find((p) => p.playerId === pitcherId);
      if (!pitcher) continue;

      console.log(`\n  Pitch ${pi + 1}/${pitcherIds.length}: ${pitcher.name}`);

      // Reveal movie
      pitcher.socket.emit("reveal_movie");
      await sleep(300);

      // Note Giver starts timer
      console.log(`    Starting timer...`);
      noteGiver?.socket.emit("start_timer");
      await sleep(500);

      // Note Giver plays a note card 70% of the time (but not on their own pitch)
      const ngState = noteGiver!.state!;
      const notes = ngState.myNoteGiverNotes || [];
      const isNoteGiverPitching = pitcherId === noteGiverId;
      if (notes.length > 0 && !isNoteGiverPitching && Math.random() < 0.7) {
        const noteId = notes[0].id;
        console.log(`    Note Giver playing note card`);
        noteGiver?.socket.emit("play_note", noteId);
        await sleep(1500);
      } else {
        await sleep(1000);
      }

      // Note Giver ends pitch
      console.log(`    Ending pitch...`);
      noteGiver?.socket.emit("end_pitch");
      await sleep(500);

      // If there are more pitchers, wait for next_pitcher or state update
      if (pi < pitcherIds.length - 1) {
        await sleep(500);
      }
    }

    // Wait for round-end (voting starts automatically)
    console.log("\n  Waiting for round-end + voting...");
    await sleep(1000);
    await waitForPhaseAll(players, "round-end");
    console.log("  Round-end phase reached (voting auto-started)");

    // All players + audience cast votes automatically
    const movies = players[0].state?.movies || [];
    if (movies.length > 0) {
      // Each player votes for a random OTHER movie (cannot self-vote)
      for (const player of players) {
        const _myMovie = movies.find((m) => m.playerId === player.playerId);
        const votableMovies = movies.filter((m) => m.playerId !== player.playerId);
        if (votableMovies.length === 0) continue;
        const voteTarget = votableMovies[Math.floor(Math.random() * votableMovies.length)];
        player.socket.emit("cast_vote", voteTarget.playerId);
      }
      console.log(`  ${players.length} players cast votes`);

      // Audience members cast random votes (can vote for anyone)
      for (const audience of audienceMembers) {
        const movie = movies[Math.floor(Math.random() * movies.length)];
        audience.socket.emit("cast_vote", movie.playerId);
      }
      if (audienceMembers.length > 0) {
        console.log(`  ${audienceMembers.length} audience members cast votes`);
      }

      await sleep(2000);

      // Voting ends automatically (all voted or timer expired)

      // Check if game ended
      const postWinState = players[0].state!;
      if (postWinState.phase === "game-end") {
        printBanner("GAME ENDED");
        const sorted = [...postWinState.players].sort((a, b) => b.score - a.score);
        for (const p of sorted) {
          console.log(`  ${p.name}: ${p.score} pts`);
        }
        break;
      }

      console.log(`  Round ${round} complete, transitioning to next round`);
    }
  }

  // Phase 4: Disconnect all
  printBanner("PHASE 4: Disconnecting all players and audience");
  for (const p of players) {
    p.socket.disconnect();
    console.log(`  [OK] ${p.name} disconnected`);
  }
  for (const a of audienceMembers) {
    a.socket.disconnect();
    console.log(`  [OK] ${a.name} disconnected`);
  }

  printBanner("STRESS TEST PASSED");
}

runGame(TARGET, NUM_PLAYERS, NUM_ROUNDS, NUM_AUDIENCE).catch((err) => {
  console.error("\n!!! STRESS TEST FAILED !!!");
  console.error(err);
  process.exit(1);
});
