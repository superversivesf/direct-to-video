import { test, expect } from "@playwright/test";
import {
  createPlayer,
  createAudience,
  clickStartGame,
  playAllToReady,
  clickStartTimer,
  clickEndPitch,
  clickVoteForMovie,
  clickDrawCards,
  waitForPhase,
  uncheckFranchise,
  cleanup,
  type PlayerSession,
} from "../helpers.js";

test.describe("Mid-game join as spectator journey", () => {
  let sessions: PlayerSession[] = [];
  let extraPages: any[] = [];

  test.afterEach(() => {
    cleanup(sessions, extraPages);
    extraPages = [];
  });

  test("new player joins mid-game, spectates current round, plays next round", async ({
    browser,
  }) => {
    test.setTimeout(180000);

    const alice = await createPlayer(browser, "", "Alice");
    sessions.push(alice);
    const roomCode = alice.roomCode;

    const bob = await createPlayer(browser, roomCode, "Bob");
    sessions.push(bob);

    const charlie = await createPlayer(browser, roomCode, "Charlie");
    sessions.push(charlie);

    const audiencePage = await createAudience(browser, roomCode);
    extraPages.push(audiencePage);

    await uncheckFranchise(alice.page);
    await clickStartGame(alice.page);
    await waitForPhase(alice.page, /Round 1|Choose your deck|You are/i, 10000);

    // Play round 1 to completion
    const { noteGiver, writers } = await playAllToReady(sessions, "plot");

    await waitForPhase(noteGiver.page, /Now Pitching|Your cards are ready|pitching/i, 15000);
    await waitForPhase(audiencePage, /Now Pitching/i, 15000);

    // While pitching is happening, a new player joins mid-game
    // Don't use createPlayer helper — it expects an h1 with "Room CODE" which
    // doesn't exist during pitching. Join manually.
    const davePage = await browser.newPage();
    extraPages.push(davePage);
    await davePage.goto("http://localhost:3100");
    await davePage.fill('input[placeholder*="Room Code"]', roomCode);
    await davePage.fill('input[placeholder*="Your Name"]', "Dave");
    await davePage.click("text=Join as Player");
    await davePage.waitForURL("**/room/**", { timeout: 15000 });
    await davePage.waitForSelector(".game-view", { timeout: 15000 });
    const dave = { page: davePage, roomCode, name: "Dave" };
    sessions.push(dave);

    // Dave should see the game is in progress — he's a spectator for this round
    // He should NOT see deck choice buttons (he can't pitch this round)
    const daveBody = await dave.page.locator("body").textContent();
    expect(daveBody).toMatch(/pitching|Now Pitching|Waiting for/i);
    // Dave should NOT see "Draw PLOT cards" — he can't play this round
    const daveHasDrawButtons = await dave.page.locator("text=Draw PLOT cards").count();
    expect(daveHasDrawButtons).toBe(0);

    // Complete the remaining pitches for round 1
    const totalPitches = writers.length + 1;
    const currentPitcherId = await audiencePage.locator("body").textContent();
    // Just complete all remaining pitches
    for (let p = 0; p < totalPitches; p++) {
      const ngHasTimer = await noteGiver.page.locator("text=Start Timer").count();
      const ngHasEndPitch = await noteGiver.page.locator("text=End Pitch").count();
      if (ngHasTimer > 0) {
        await clickStartTimer(noteGiver.page);
        await new Promise((r) => setTimeout(r, 700));
      }
      if (ngHasEndPitch > 0) {
        await clickEndPitch(noteGiver.page);
        await new Promise((r) => setTimeout(r, 600));
      }
      const audienceText = await audiencePage.locator("body").textContent();
      if (audienceText?.includes("Now Pitching") && p < totalPitches - 1) {
        await waitForPhase(audiencePage, /Now Pitching/i, 15000).catch(() => {});
      }
    }

    // Voting phase — Dave should be able to vote as a spectator
    await waitForPhase(noteGiver.page, /Vote for the best movie/i, 15000);

    // Dave should see vote buttons (spectators can vote)
    const daveVoteButtons = dave.page.locator("button.btn-vote");
    const daveVoteCount = await daveVoteButtons.count();
    expect(daveVoteCount).toBeGreaterThan(0);

    // All players + Dave vote
    for (const player of sessions) {
      const voteButtons = player.page.locator("button.btn-vote");
      const count = await voteButtons.count();
      if (count > 0) {
        await clickVoteForMovie(player.page, 0);
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    await clickVoteForMovie(audiencePage, 0);

    // Round should end and advance to round 2
    await expect
      .poll(
        async () => {
          const r = (await noteGiver.page.locator("body").textContent()) ?? "";
          return /Writers are choosing|Round 2|Choose your deck/i.test(r);
        },
        { timeout: 20000, intervals: [500] },
      )
      .toBeTruthy();

    // In round 2, Dave should be a full player — he should see deck choice buttons
    await waitForPhase(dave.page, /Draw PLOT cards|Draw CHARACTER cards/i, 15000);
    const daveHasDrawButtons2 = await dave.page.locator("text=Draw PLOT cards").count();
    expect(daveHasDrawButtons2).toBeGreaterThan(0);

    // Dave should no longer be marked as spectating
    const daveBodyRound2 = await dave.page.locator("body").textContent();
    expect(daveBodyRound2).not.toContain("(spectating)");

    // Dave can draw cards and play normally
    await clickDrawCards(dave.page, "plot");
    await dave.page.waitForSelector(".card-row .card-template", { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 300));
    await dave.page.click(".card-row .card-template >> nth=0");
    await new Promise((r) => setTimeout(r, 500));
    const daveHasReady = await dave.page.locator("text=Ready to Pitch").count();
    if (daveHasReady > 0) {
      await dave.page.locator("button.btn-ready:not([disabled])").click({ timeout: 10000 });
    }
  });
});