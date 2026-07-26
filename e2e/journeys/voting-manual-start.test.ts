import { test, expect } from "@playwright/test";
import {
  createPlayer,
  createAudience,
  clickStartGame,
  playAllToReady,
  clickStartTimer,
  clickEndPitch,
  clickStartVoting,
  clickVoteForMovie,
  waitForPhase,
  uncheckFranchise,
  cleanup,
  type PlayerSession,
} from "../helpers.js";

test.describe("Voting manual start journey", () => {
  let sessions: PlayerSession[] = [];
  let extraPages: import("@playwright/test").Page[] = [];

  test.afterEach(() => {
    cleanup(sessions, extraPages);
    sessions = [];
    extraPages = [];
  });

  test("note giver manually starts voting after all pitches", async ({ browser }) => {
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

    await uncheckFranchise(alice.page);
    await clickStartGame(alice.page);
    await waitForPhase(alice.page, /Round 1|Choose your deck|You are/i, 10000);

    const { noteGiver, writers } = await playAllToReady(sessions, "plot");

    await waitForPhase(noteGiver.page, /Now Pitching|Your cards are ready|pitching/i, 15000);
    await waitForPhase(audiencePage, /Now Pitching/i, 15000);

    const totalPitches = writers.length + 1;
    for (let p = 0; p < totalPitches; p++) {
      await clickStartTimer(noteGiver.page);
      await new Promise((r) => setTimeout(r, 700));
      await clickEndPitch(noteGiver.page);
      await new Promise((r) => setTimeout(r, 600));
      if (p < totalPitches - 1) {
        await waitForPhase(audiencePage, /Now Pitching/i, 15000);
      }
    }

    // All pitches done — note giver should see "Start Voting" button
    await expect(noteGiver.page.locator("button.btn-start-voting")).toBeVisible({ timeout: 10000 });

    // Other players should see waiting message
    const otherPlayer = writers[0];
    await expect(otherPlayer.page.locator("text=/waiting.*note giver.*start voting/i")).toBeVisible(
      {
        timeout: 5000,
      },
    );

    // Audience should see waiting message
    await expect(audiencePage.locator("text=/waiting.*note giver/i")).toBeVisible({
      timeout: 5000,
    });

    // Note giver starts voting
    await clickStartVoting(noteGiver.page);

    // All players should see voting UI
    await waitForPhase(noteGiver.page, /Vote for the best movie/i, 15000);
    await waitForPhase(audiencePage, /Vote for the Best Movie/i, 15000);

    // Vote
    for (const player of sessions) {
      const voteButtons = player.page.locator("button.btn-vote");
      const count = await voteButtons.count();
      if (count > 0) {
        await clickVoteForMovie(player.page, 0);
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    await clickVoteForMovie(audiencePage, 0);

    // Round should end
    await expect
      .poll(
        async () => {
          const r = (await noteGiver.page.locator("body").textContent()) ?? "";
          return /wins this round|Writers are choosing|Round \d+|wins!|It's a tie/i.test(r);
        },
        { timeout: 20000, intervals: [500] },
      )
      .toBeTruthy();
  });
});
