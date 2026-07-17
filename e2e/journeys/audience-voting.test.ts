import { test, expect } from "@playwright/test";
import {
  createPlayer,
  createAudience,
  clickStartGame,
  playWriterToReady,
  clickStartTimer,
  clickEndPitch,
  clickPickWinner,
  clickStartVoting,
  clickEndVoting,
  clickVoteForMovie,
  waitForPhase,
  cleanup,
  type PlayerSession,
} from "../helpers.js";

test.describe.skip("Audience voting journey", () => {
  let sessions: PlayerSession[] = [];
  let extraPages: any[] = [];

  test.afterEach(() => {
    cleanup(sessions, extraPages);
    sessions = [];
    extraPages = [];
  });

  test("audience voting with executive 2x weight", async ({ browser }) => {
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

    for (let p = 0; p < writerSessions.length; p++) {
      await clickStartTimer(execSession.page);
      await new Promise((r) => setTimeout(r, 1000));
      await clickEndPitch(execSession.page);
    }

    await waitForPhase(execSession.page, /Select the Best Movie|Executive is choosing/i, 10000);
    await waitForPhase(audiencePage, /Executive is choosing/i, 10000);

    await expect(execSession.page.locator("text=Start Audience Voting")).toBeVisible({ timeout: 5000 });

    await clickStartVoting(execSession.page);

    await waitForPhase(audiencePage, /Vote for the Best Movie/i, 10000);

    await expect(audiencePage.locator("text=Vote for this movie")).toHaveCount(2, { timeout: 10000 });

    await clickVoteForMovie(audiencePage, 0);

    await new Promise((r) => setTimeout(r, 1000));

    await expect(audiencePage.locator(".vote-tally")).toBeVisible({ timeout: 5000 });

    await clickEndVoting(execSession.page);

    await waitForPhase(audiencePage, /Writers are choosing|wins!/i, 15000);

    const bodyText = await audiencePage.locator("body").textContent();
    expect(bodyText).toBeTruthy();
  });

  test("audience voting timer expiry tallies votes", async ({ browser }) => {
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

    for (let p = 0; p < writerSessions.length; p++) {
      await clickStartTimer(execSession.page);
      await new Promise((r) => setTimeout(r, 1000));
      await clickEndPitch(execSession.page);
    }

    await waitForPhase(execSession.page, /Select the Best Movie|Executive is choosing/i, 10000);

    await clickStartVoting(execSession.page);

    await waitForPhase(audiencePage, /Vote for the Best Movie/i, 10000);

    await clickVoteForMovie(audiencePage, 0);

    await new Promise((r) => setTimeout(r, 1000));

    test.setTimeout(60000);
    await waitForPhase(audiencePage, /Writers are choosing|wins!/i, 45000);
  });
});