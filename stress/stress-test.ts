import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import type { PublicRoomState, DeckType } from "@direct-to-video/shared";

const TARGET = process.env.STRESS_TARGET || "http://localhost:3000";
const NUM_PLAYERS = parseInt(process.env.STRESS_PLAYERS || "10", 10);
const NUM_ROUNDS = parseInt(process.env.STRESS_ROUNDS || "3", 10);

interface Player {
  name: string;
  socket: ClientSocket;
  playerId: string;
  roomCode: string;
  state: PublicRoomState | null;
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

function waitForPhase(socket: ClientSocket, phase: string, timeout = 10000): Promise<PublicRoomState> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for phase ${phase}`)), timeout);
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

function printBanner(text: string): void {
  const line = "=".repeat(60);
  console.log(`\n${line}\n${text}\n${line}`);
}

async function runGame(target: string, numPlayers: number, numRounds: number): Promise<void> {
  printBanner(`STRESS TEST: ${numPlayers} players, ${numRounds} rounds, target ${target}`);

  const players: Player[] = [];
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

  // Subscribe all players to state updates
  for (const p of players) {
    p.socket.on("room_joined", (state: PublicRoomState) => {
      p.state = state;
    });
  }

  console.log(`\n  All ${players.length} players connected to room ${roomCode}`);

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
    if (players[0].state?.phase !== "setup") {
      await Promise.all(players.map((p) => waitForPhase(p.socket, "setup").catch(() => null)));
    }

    const currentState = players[0].state!;
    const executiveId = currentState.executiveId;
    const executive = players.find((p) => p.playerId === executiveId);
    const writers = players.filter((p) => p.playerId !== executiveId);

    console.log(`  Executive: ${executive?.name}`);
    console.log(`  Writers: ${writers.map((w) => w.name).join(", ")}`);

    // Writers select deck type and cards
    // First: all writers select their deck type
    for (const writer of writers) {
      const writerState = writer.state!;
      if (!writerState.myHand || writerState.myHand.length === 0) {
        const deckType: DeckType = Math.random() < 0.5 ? "plot" : "character";
        console.log(`  ${writer.name} selecting deck: ${deckType}`);
        writer.socket.emit("select_deck_type", deckType);
      }
    }
    await sleep(1000);

    // Then: all writers select a card from their hand
    for (const writer of writers) {
      const deckState = writer.state!;
      const cardId = deckState.myHand?.[0]?.id;
      if (cardId) {
        console.log(`  ${writer.name} selecting card ${cardId}`);
        writer.socket.emit("select_card", cardId);
      } else {
        console.log(`  ${writer.name} has no cards in hand! (phase: ${deckState.phase}, hand: ${deckState.myHand?.length ?? 0})`);
      }
    }
    await sleep(1000);

    // Wait for pitching phase
    console.log("  Waiting for pitching phase...");
    if (players[0].state?.phase !== "pitching") {
      await Promise.all(players.map((p) => waitForPhase(p.socket, "pitching")));
    }
    console.log("  Pitching phase reached");

    const pitchState = players[0].state!;
    // All writers are pitchers; use currentPitcherId to determine order
    const pitcherIds = writers.map((w) => w.playerId);
    console.log(`  Pitchers: ${pitcherIds.map((id) => players.find((p) => p.playerId === id)?.name).join(", ")}`);

    // Play through each pitcher
    for (let pi = 0; pi < pitcherIds.length; pi++) {
      const pitcherId = pitcherIds[pi];
      const pitcher = players.find((p) => p.playerId === pitcherId);
      if (!pitcher) continue;

      console.log(`\n  Pitch ${pi + 1}/${pitcherIds.length}: ${pitcher.name}`);

      // Reveal movie
      pitcher.socket.emit("reveal_movie");
      await sleep(300);

      // Executive starts timer
      console.log(`    Starting timer...`);
      executive?.socket.emit("start_timer");
      await sleep(500);

      // Executive plays a note card 70% of the time
      const execState = executive!.state!;
      const notes = execState.myExecutiveNotes || [];
      if (notes.length > 0 && Math.random() < 0.7) {
        const noteId = notes[0].id;
        console.log(`    Exec playing note card`);
        executive?.socket.emit("play_note", noteId);
        await sleep(1500);
      } else {
        await sleep(1000);
      }

      // Executive ends pitch
      console.log(`    Ending pitch...`);
      executive?.socket.emit("end_pitch");
      await sleep(500);

      // If there are more pitchers, wait for next_pitcher or state update
      if (pi < pitcherIds.length - 1) {
        await sleep(500);
      }
    }

    // Wait for round-end
    console.log("\n  Waiting for round-end...");
    if (players[0].state?.phase !== "round-end") {
      await Promise.all(players.map((p) => waitForPhase(p.socket, "round-end")));
    }
    console.log("  Round-end phase reached");

    // Executive picks a random winner
    const movies = players[0].state?.movies || [];
    if (movies.length > 0) {
      const winnerMovie = movies[Math.floor(Math.random() * movies.length)];
      const winnerName = players.find((p) => p.playerId === winnerMovie.playerId)?.name;
      console.log(`\n  Executive selecting winner: ${winnerName}`);

      executive?.socket.emit("select_winner", winnerMovie.playerId);

      // Check if game ended
      await sleep(1000);
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
  printBanner("PHASE 4: Disconnecting all players");
  for (const p of players) {
    p.socket.disconnect();
    console.log(`  [OK] ${p.name} disconnected`);
  }

  printBanner("STRESS TEST PASSED");
}

runGame(TARGET, NUM_PLAYERS, NUM_ROUNDS).catch((err) => {
  console.error("\n!!! STRESS TEST FAILED !!!");
  console.error(err);
  process.exit(1);
});