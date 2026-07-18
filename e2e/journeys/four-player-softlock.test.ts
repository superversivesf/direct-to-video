import { test, expect } from "@playwright/test";
import {
  createPlayer,
  createAudience,
  clickStartGame,
  playAllToReady,
  clickStartTimer,
  clickEndPitch,
  clickVoteForMovie,
  waitForPhase,
  _findNoteGiverSession,
  cleanup,
  type PlayerSession,
} from "../helpers.js";

test.describe("4-player round 2 soft-lock regression", () => {
  let sessions: PlayerSession[] = [];
  let extraPages: any[] = [];

  test.afterEach(() => {
    cleanup(sessions, extraPages);
    sessions = [];
    extraPages = [];
  });

  test("4-player game round 2 does not soft-lock", async ({ browser }) => {
    test.setTimeout(300000);

    const p1 = await createPlayer(browser, "", "P1");
    sessions.push(p1);
    const roomCode = p1.roomCode;

    const p2 = await createPlayer(browser, roomCode, "P2");
    sessions.push(p2);

    const p3 = await createPlayer(browser, roomCode, "P3");
    sessions.push(p3);

    const p4 = await createPlayer(browser, roomCode, "P4");
    sessions.push(p4);

    const audiencePage = await createAudience(browser, roomCode);
    extraPages.push(audiencePage);

    const players = [p1, p2, p3, p4];

    await clickStartGame(p1.page);
    await waitForPhase(p1.page, /Round 1|Choose your deck|You are/i, 10000);
    await waitForPhase(audiencePage, /Writers are choosing/i, 10000);

    for (let round = 0; round < 5; round++) {
      const { noteGiver, writers } = await playAllToReady(players, "plot");

      await waitForPhase(noteGiver.page, /Now Pitching|Your cards are ready|pitching/i, 15000);

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

      await waitForPhase(noteGiver.page, /Vote for the best movie/i, 15000);

      await expect(noteGiver.page.locator("button.btn-vote")).toHaveCount(writers.length, {
        timeout: 10000,
      });

      for (const player of players) {
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
            return /wins this round|Writers are choosing|Round \d+ of|wins!|It's a tie/i.test(r);
          },
          { timeout: 20000, intervals: [500] },
        )
        .toBeTruthy();

      if (round < 4) {
        await waitForPhase(audiencePage, /Writers are choosing/i, 15000);
      }
    }

    await waitForPhase(p1.page, /wins!|It's a tie!/i, 10000);
    await expect(audiencePage.locator(".winner-spotlight")).toBeVisible({ timeout: 10000 });
  });
});
