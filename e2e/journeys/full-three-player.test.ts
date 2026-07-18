import { test, expect } from "@playwright/test";
import {
  createPlayer,
  createAudience,
  clickStartGame,
  playAllToReady,
  clickStartTimer,
  clickEndPitch,
  clickVoteForMovie,
  setTotalRounds,
  waitForPhase,
  findNoteGiverSession,
  cleanup,
  type PlayerSession,
} from "../helpers.js";

test.describe("Full 3-player game journey", () => {
  let sessions: PlayerSession[] = [];
  let extraPages: any[] = [];

  test.afterEach(() => {
    cleanup(sessions, extraPages);
    sessions = [];
    extraPages = [];
  });

  test("3-player game with note-giver rotation and play again", async ({ browser }) => {
    test.setTimeout(300000);

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

    await setTotalRounds(alice.page, 3);
    await clickStartGame(alice.page);
    await waitForPhase(audiencePage, /Writers are choosing/i, 15000);

    for (let round = 1; round <= 3; round++) {
      const { noteGiver, writers } = await playAllToReady(sessions, "plot");

      await waitForPhase(noteGiver.page, /Now Pitching|Your cards are ready|pitching/i, 15000);
      await waitForPhase(audiencePage, /Now Pitching/i, 15000);

      const totalPitches = writers.length + 1;

      for (let p = 0; p < totalPitches; p++) {
        await clickStartTimer(noteGiver.page);
        await new Promise((r) => setTimeout(r, 800));
        await clickEndPitch(noteGiver.page);
        await new Promise((r) => setTimeout(r, 700));

        if (p < totalPitches - 1) {
          await waitForPhase(audiencePage, /Now Pitching/i, 15000);
        }
      }

      await waitForPhase(noteGiver.page, /Vote for the best movie/i, 15000);
      await waitForPhase(audiencePage, /Vote for the Best Movie/i, 15000);

      await expect(noteGiver.page.locator("button.btn-vote")).toHaveCount(writers.length, {
        timeout: 10000,
      });
      await expect(audiencePage.locator("button.btn-vote")).toHaveCount(3, { timeout: 10000 });

      for (const player of sessions) {
        const voteButtons = player.page.locator("button.btn-vote");
        const count = await voteButtons.count();
        if (count > 0) {
          await clickVoteForMovie(player.page, 0);
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      await clickVoteForMovie(audiencePage, 0);

      await expect.poll(async () => {
        const r = await noteGiver.page.locator("body").textContent() ?? "";
        return /wins this round|Writers are choosing|Round \d+|wins!|It's a tie/i.test(r);
      }, { timeout: 20000, intervals: [500] }).toBeTruthy();

      if (round < 3) {
        await waitForPhase(audiencePage, /Writers are choosing/i, 15000);
      }
    }

    await waitForPhase(audiencePage, /wins!|It's a tie!/i, 15000);
    await expect(audiencePage.locator(".winner-spotlight")).toBeVisible({ timeout: 10000 });

    const hostSession = sessions[0];
    await expect(hostSession.page.locator("text=Play Again")).toBeVisible({ timeout: 10000 });
    await hostSession.page.click("text=Play Again");

    await waitForPhase(audiencePage, /Waiting for game to start/i, 10000);

    await expect(audiencePage.locator(".audience-lobby")).toContainText("Alice");
    await expect(audiencePage.locator(".audience-lobby")).toContainText("Bob");
    await expect(audiencePage.locator(".audience-lobby")).toContainText("Charlie");
  });
});