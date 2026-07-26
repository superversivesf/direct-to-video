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

test.describe("Disconnect spectator journey", () => {
  let sessions: PlayerSession[] = [];
  let extraPages: import("@playwright/test").Page[] = [];

  test.afterEach(() => {
    cleanup(sessions, extraPages);
    sessions = [];
    extraPages = [];
  });

  test("disconnected player becomes spectator immediately, game continues", async ({ browser }) => {
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

    // Disconnect one writer during pitching
    const disconnectTarget = writers[0];
    await disconnectTarget.page.close();
    sessions = sessions.filter((s) => s !== disconnectTarget);

    await new Promise((r) => setTimeout(r, 1000));

    // Game should continue — remaining players should still be in pitching
    const remainingPlayers = sessions;
    for (const p of remainingPlayers) {
      const body = await p.page.locator("body").textContent();
      expect(body).toMatch(/pitching|Now Pitching|cards are ready/i);
    }

    // Complete pitches for remaining players
    const totalPitches = remainingPlayers.length;
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
    }

    // Should reach voting
    await expect(noteGiver.page.locator("button.btn-start-voting")).toBeVisible({ timeout: 10000 });
    await clickStartVoting(noteGiver.page);
    await waitForPhase(noteGiver.page, /Vote for the best movie/i, 15000);

    for (const player of remainingPlayers) {
      const voteButtons = player.page.locator("button.btn-vote");
      const count = await voteButtons.count();
      if (count > 0) {
        await clickVoteForMovie(player.page, 0);
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    await clickVoteForMovie(audiencePage, 0);

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
