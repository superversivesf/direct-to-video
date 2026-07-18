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
  findNoteGiverSession,
  cleanup,
  type PlayerSession,
} from "../helpers.js";

test.describe("Auto-draw cards journey", () => {
  let sessions: PlayerSession[] = [];
  let extraPages: any[] = [];

  test.afterEach(() => {
    cleanup(sessions, extraPages);
    sessions = [];
    extraPages = [];
  });

  test("card with draws substitutes ____ placeholder in UI", async ({ browser }) => {
    test.setTimeout(120000);

    const alice = await createPlayer(browser, "", "Alice");
    sessions.push(alice);
    const roomCode = alice.roomCode;

    const bob = await createPlayer(browser, roomCode, "Bob");
    sessions.push(bob);

    const audiencePage = await createAudience(browser, roomCode);
    extraPages.push(audiencePage);

    const players = [alice, bob];

    await clickStartGame(alice.page);
    await waitForPhase(alice.page, /Round 1|Choose your deck|You are/i, 10000);

    const { noteGiver, writers } = await playAllToReady(players, "plot");

    await waitForPhase(noteGiver.page, /Now Pitching|Your cards are ready|pitching/i, 15000);
    await waitForPhase(audiencePage, /Now Pitching/i, 15000);

    const allCardTexts: string[] = [];
    for (const player of players) {
      const texts = await player.page.locator(".card-text").allTextContents();
      allCardTexts.push(...texts);
    }
    const hasSubstituted = allCardTexts.some((t) => !t.includes("____") && t.length > 10);

    expect(hasSubstituted).toBe(true);

    await clickStartTimer(noteGiver.page);
    await new Promise((r) => setTimeout(r, 1000));

    const totalPitches = writers.length + 1;
    for (let p = 0; p < totalPitches; p++) {
      await clickEndPitch(noteGiver.page);
      await new Promise((r) => setTimeout(r, 600));
      if (p < totalPitches - 1) {
        await clickStartTimer(noteGiver.page);
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    await waitForPhase(noteGiver.page, /Vote for the best movie/i, 10000);

    const audienceMovieText = await audiencePage.locator(".audience-movie-card").first().textContent().catch(() => "");
    expect(audienceMovieText).toBeTruthy();

    const playerMovieText = await noteGiver.page.locator(".round-summary-movie, .movie-reveal").first().textContent().catch(() => "");
    expect(playerMovieText).toBeTruthy();

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
      const r = await noteGiver.page.locator("body").textContent() ?? "";
      return /wins this round|Writers are choosing|Round \d+ of|wins!|It's a tie/i.test(r);
    }, { timeout: 20000, intervals: [500] }).toBeTruthy();
  });
});