import { test, expect } from "@playwright/test";
import {
  createPlayer,
  createAudience,
  clickStartGame,
  playWriterToReady,
  clickStartTimer,
  clickEndPitch,
  clickPickWinner,
  clickPlayAgain,
  waitForPhase,
  cleanup,
  type PlayerSession,
} from "../helpers.js";

test.describe.skip("Full 3-player game journey", () => {
  let sessions: PlayerSession[] = [];
  let extraPages: any[] = [];

  test.afterEach(() => {
    cleanup(sessions, extraPages);
    sessions = [];
    extraPages = [];
  });

  test("3-player game with role rotation and play again", async ({ browser }) => {
    test.setTimeout(180000);

    const alice = await createPlayer(browser, "", "Alice");
    sessions.push(alice);
    const roomCode = alice.roomCode;
    expect(roomCode).toMatch(/^[A-Z]{4}$/);

    const bob = await createPlayer(browser, roomCode, "Bob");
    sessions.push(bob);

    const charlie = await createPlayer(browser, roomCode, "Charlie");
    sessions.push(charlie);

    const audiencePage = await createAudience(browser, roomCode);
    extraPages.push(audiencePage);

    await expect(audiencePage.locator(".audience-lobby")).toContainText("Alice");
    await expect(audiencePage.locator(".audience-lobby")).toContainText("Bob");
    await expect(audiencePage.locator(".audience-lobby")).toContainText("Charlie");

    const players = [alice, bob, charlie];

    await clickStartGame(alice.page);

    await waitForPhase(alice.page, /Executive.*Waiting for writers|Choose your deck|Round 1/i, 10000);
    await waitForPhase(audiencePage, /Writers are choosing/i, 10000);

    for (let round = 0; round < 3; round++) {
      const execSession = players[round];
      const writerSessions = players.filter((_, i) => i !== round);

      for (const writer of writerSessions) {
        await playWriterToReady(writer.page, "plot");
      }

      await waitForPhase(execSession.page, /Now Pitching|Waiting for/i, 15000);
      await waitForPhase(audiencePage, /Now Pitching/i, 15000);

      for (let p = 0; p < writerSessions.length; p++) {
        await clickStartTimer(execSession.page);
        await new Promise((r) => setTimeout(r, 1000));
        await clickEndPitch(execSession.page);
      }

      await waitForPhase(execSession.page, /Select the Best Movie|Executive is choosing/i, 10000);
      await waitForPhase(audiencePage, /Executive is choosing/i, 10000);

      await clickPickWinner(execSession.page, 0);
      await new Promise((r) => setTimeout(r, 1500));

      if (round < 2) {
        await waitForPhase(audiencePage, /Writers are choosing/i, 10000);
      }
    }

    await waitForPhase(alice.page, /wins!/i, 10000);
    await waitForPhase(audiencePage, /wins!/i, 10000);
    await expect(audiencePage.locator(".winner-spotlight")).toBeVisible({ timeout: 10000 });

    await expect(alice.page.locator("text=Play Again")).toBeVisible({ timeout: 10000 });

    await clickPlayAgain(alice.page);
    await waitForPhase(alice.page, /Start Game/i, 10000);
    await waitForPhase(audiencePage, /Waiting for game/i, 10000);

    await expect(audiencePage.locator(".audience-lobby")).toContainText("Alice");
    await expect(audiencePage.locator(".audience-lobby")).toContainText("Bob");
    await expect(audiencePage.locator(".audience-lobby")).toContainText("Charlie");
  });
});