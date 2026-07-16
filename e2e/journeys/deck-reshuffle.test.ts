import { test, expect } from "@playwright/test";
import {
  createPlayer,
  createAudience,
  clickStartGame,
  playWriterToReady,
  clickStartTimer,
  clickEndPitch,
  clickPickWinner,
  waitForPhase,
  cleanup,
  type PlayerSession,
} from "../helpers.js";

test.describe("Deck reshuffle journey", () => {
  let sessions: PlayerSession[] = [];
  let extraPages: any[] = [];

  test.afterEach(() => {
    cleanup(sessions, extraPages);
    sessions = [];
    extraPages = [];
  });

  test("4-player game with 2 rounds completes without deck errors", async ({ browser }) => {
    test.setTimeout(180000);

    const alice = await createPlayer(browser, "", "Alice");
    sessions.push(alice);
    const roomCode = alice.roomCode;

    const bob = await createPlayer(browser, roomCode, "Bob");
    sessions.push(bob);

    const charlie = await createPlayer(browser, roomCode, "Charlie");
    sessions.push(charlie);

    const dave = await createPlayer(browser, roomCode, "Dave");
    sessions.push(dave);

    const audiencePage = await createAudience(browser, roomCode);
    extraPages.push(audiencePage);

    const players = [alice, bob, charlie, dave];

    await clickStartGame(alice.page);
    await waitForPhase(alice.page, /Round 1/i, 10000);

    for (let round = 0; round < 4; round++) {
      const execSession = players[round];
      const writerSessions = players.filter((_, i) => i !== round);

      for (const writer of writerSessions) {
        await playWriterToReady(writer.page, round % 2 === 0 ? "plot" : "character");
      }

      await waitForPhase(execSession.page, /Now Pitching|Waiting for/i, 15000);

      for (let p = 0; p < writerSessions.length; p++) {
        await clickStartTimer(execSession.page);
        await new Promise((r) => setTimeout(r, 1000));
        await clickEndPitch(execSession.page);
      }

      await waitForPhase(execSession.page, /Select the Best Movie|Executive is choosing/i, 10000);

      await clickPickWinner(execSession.page, 0);
      await new Promise((r) => setTimeout(r, 1500));
    }

    await waitForPhase(alice.page, /wins!/i, 15000);
    await expect(audiencePage.locator(".winner-spotlight")).toBeVisible({ timeout: 10000 });
  });
});