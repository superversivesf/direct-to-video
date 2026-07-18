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
} from "./helpers.js";

/**
 * E2E test for a full 2-player Direct to Video game (v2.0 flow).
 *
 * Drives a complete game through the browser UI: lobby → setup →
 * card-selection → pitching → round-end (auto-voting) → ... → game-end.
 *
 * v2.0 changes vs v1.x:
 * - No executive role; a "note giver" is randomly assigned each round
 * - The note giver manages the timer + plays NOTE cards; also pitches last
 * - Voting is automatic — 15s timer starts when all pitches done
 * - All players + audience vote; players can't vote for themselves
 * - No `select_winner` event — `tallyAndAdvance` computes the winner
 * - Cumulative scoring across rounds
 *
 * In 2-player games, the note giver is also a writer (draws + pitches).
 */

test.describe("Full 2-player game (UI-driven)", () => {
  let sessions: PlayerSession[] = [];
  let extraPages: any[] = [];

  test.afterEach(() => {
    cleanup(sessions, extraPages);
    sessions = [];
    extraPages = [];
  });

  test("full 2-player game through all phases", async ({ browser }) => {
    test.setTimeout(300000);

    const host = await createPlayer(browser, "", "Host");
    sessions.push(host);
    const roomCode = host.roomCode;
    expect(roomCode).toMatch(/^[A-Z]{4}$/);

    const guest = await createPlayer(browser, roomCode, "Guest");
    sessions.push(guest);

    const audiencePage = await createAudience(browser, roomCode);
    extraPages.push(audiencePage);

    await expect(audiencePage.locator(".audience-lobby")).toContainText("Host");
    await expect(audiencePage.locator(".audience-lobby")).toContainText("Guest");
    await expect(audiencePage.locator("text=/Waiting for game to start/i")).toBeVisible();

    await setTotalRounds(host.page, 5);
    await clickStartGame(host.page);

    await waitForPhase(audiencePage, /Writers are choosing/i, 15000);

    const players = [host, guest];

    for (let round = 1; round <= 5; round++) {
      const { noteGiver, writers } = await playAllToReady(players, "plot");

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

      await expect(audiencePage.locator("button.btn-vote")).toHaveCount(2, { timeout: 10000 });

      for (const player of players) {
        const voteButtons = player.page.locator("button.btn-vote");
        const count = await voteButtons.count();
        if (count > 0) {
          await clickVoteForMovie(player.page, 0);
          await new Promise((r) => setTimeout(r, 300));
        }
      }
      await clickVoteForMovie(audiencePage, 0);

      await expect.poll(async () => {
        const r = await audiencePage.locator("body").textContent() ?? "";
        return /wins this round|Writers are choosing|Round \d+ of|wins!|It's a tie/i.test(r);
      }, { timeout: 20000, intervals: [500] }).toBeTruthy();

      await new Promise((r) => setTimeout(r, 1000));
    }

    await waitForPhase(audiencePage, /wins!|It's a tie!/i, 15000);
    await expect(audiencePage.locator(".audience-game-end")).toBeVisible({ timeout: 10000 });
    await expect(audiencePage.locator(".winner-spotlight")).toBeVisible({ timeout: 10000 });
    await expect(audiencePage.locator(".audience-footer .scoreboard")).toBeVisible({ timeout: 10000 });

    const scoreboardText = await audiencePage.locator(".audience-footer .scoreboard").textContent();
    expect(scoreboardText).toContain("Host");
    expect(scoreboardText).toContain("Guest");
  });
});