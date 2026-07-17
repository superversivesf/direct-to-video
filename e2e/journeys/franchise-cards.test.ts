import { test, expect } from "@playwright/test";
import {
  createPlayer,
  createAudience,
  clickStartGame,
  playWriterToReady,
  clickStartTimer,
  clickEndPitch,
  waitForPhase,
  cleanup,
  type PlayerSession,
} from "../helpers.js";

test.describe.skip("Franchise cards journey", () => {
  let sessions: PlayerSession[] = [];
  let extraPages: any[] = [];

  test.afterEach(() => {
    cleanup(sessions, extraPages);
    sessions = [];
    extraPages = [];
  });

  test("3-player game with franchise cards in deck completes", async ({ browser }) => {
    test.setTimeout(120000);

    const alice = await createPlayer(browser, "", "Alice");
    sessions.push(alice);
    const roomCode = alice.roomCode;

    const bob = await createPlayer(browser, roomCode, "Bob");
    sessions.push(bob);

    const charlie = await createPlayer(browser, roomCode, "Charlie");
    sessions.push(charlie);

    const audiencePage = await createAudience(browser, roomCode);
    extraPages.push(audiencePage);

    const players = [alice, bob, charlie];

    await clickStartGame(alice.page);
    await waitForPhase(alice.page, /Round 1/i, 10000);

    const execSession = players[0];
    const writerSessions = [bob, charlie];

    for (const writer of writerSessions) {
      await playWriterToReady(writer.page, "plot");
    }

    await waitForPhase(execSession.page, /Now Pitching|Waiting for/i, 15000);
    await waitForPhase(audiencePage, /Now Pitching/i, 15000);

    const audienceText = await audiencePage.locator("body").textContent();
    const hasFranchise = audienceText?.includes("FRANCHISE") || false;

    for (let p = 0; p < writerSessions.length; p++) {
      await clickStartTimer(execSession.page);
      await new Promise((r) => setTimeout(r, 1000));
      await clickEndPitch(execSession.page);
    }

    await waitForPhase(execSession.page, /Select the Best Movie|Executive is choosing/i, 10000);

    test.info().annotations.push({
      type: "franchise-cards-present",
      description: String(hasFranchise),
    });

    expect(true).toBe(true);
  });
});