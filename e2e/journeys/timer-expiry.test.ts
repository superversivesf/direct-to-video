import { test, expect } from "@playwright/test";
import {
  createPlayer,
  createAudience,
  clickStartGame,
  playWriterToReady,
  clickStartTimer,
  waitForPhase,
  cleanup,
  type PlayerSession,
} from "../helpers.js";

test.describe.skip("Timer expiry journey", () => {
  let sessions: PlayerSession[] = [];
  let extraPages: any[] = [];

  test.afterEach(() => {
    cleanup(sessions, extraPages);
    sessions = [];
    extraPages = [];
  });

  test("pitch timer expires and auto-advances to round-end", async ({ browser }) => {
    test.setTimeout(150000);

    const alice = await createPlayer(browser, "", "Alice");
    sessions.push(alice);
    const roomCode = alice.roomCode;

    const bob = await createPlayer(browser, roomCode, "Bob");
    sessions.push(bob);

    const audiencePage = await createAudience(browser, roomCode);
    extraPages.push(audiencePage);

    const players = [alice, bob];

    await clickStartGame(alice.page);
    await waitForPhase(alice.page, /Round 1/i, 10000);

    const execSession = players[0];
    const writerSession = players[1];

    await playWriterToReady(writerSession.page, "plot");

    await waitForPhase(execSession.page, /Now Pitching|Waiting for/i, 15000);
    await waitForPhase(audiencePage, /Now Pitching/i, 15000);

    await clickStartTimer(execSession.page);

    await waitForPhase(execSession.page, /Select the Best Movie|Executive is choosing/i, 60000);
    await waitForPhase(audiencePage, /Executive is choosing/i, 10000);
  });
});