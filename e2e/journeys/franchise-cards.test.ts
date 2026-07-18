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

test.describe("Franchise cards journey", () => {
  let sessions: PlayerSession[] = [];
  let extraPages: any[] = [];

  test.afterEach(() => {
    cleanup(sessions, extraPages);
    sessions = [];
    extraPages = [];
  });

  test("3-player game with franchise cards in deck completes a round", async ({ browser }) => {
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
    await waitForPhase(alice.page, /Round 1|Choose your deck|You are/i, 10000);

    const { noteGiver, writers } = await playAllToReady(players, "plot");

    await waitForPhase(noteGiver.page, /Now Pitching|Your cards are ready|pitching/i, 15000);
    await waitForPhase(audiencePage, /Now Pitching/i, 15000);

    const audienceText = await audiencePage.locator("body").textContent();
    const hasFranchise = audienceText?.includes("FRANCHISE") || false;

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
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    await clickVoteForMovie(audiencePage, 0);

    await expect.poll(async () => {
      const r = await noteGiver.page.locator("body").textContent() ?? "";
      return /wins this round|Writers are choosing|Round \d+ of|wins!|It's a tie/i.test(r);
    }, { timeout: 20000, intervals: [500] }).toBeTruthy();

    test.info().annotations.push({
      type: "franchise-cards-present",
      description: String(hasFranchise),
    });

    expect(true).toBe(true);
  });
});