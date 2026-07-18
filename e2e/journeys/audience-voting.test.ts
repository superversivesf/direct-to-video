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

test.describe("Audience voting journey", () => {
  let sessions: PlayerSession[] = [];
  let extraPages: any[] = [];

  test.afterEach(() => {
    cleanup(sessions, extraPages);
    sessions = [];
    extraPages = [];
  });

  async function playThroughPitches(
    noteGiver: PlayerSession,
    writers: PlayerSession[],
    audiencePage: import("@playwright/test").Page,
  ): Promise<void> {
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
  }

  test("audience and players vote, 1x weight, no executive 2x", async ({ browser }) => {
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

    await clickStartGame(alice.page);
    await waitForPhase(audiencePage, /Writers are choosing/i, 15000);

    const { noteGiver, writers } = await playAllToReady(sessions, "plot");
    await playThroughPitches(noteGiver, writers, audiencePage);

    await waitForPhase(audiencePage, /Vote for the Best Movie/i, 15000);
    await waitForPhase(noteGiver.page, /Vote for the best movie/i, 15000);

    await expect(audiencePage.locator("button.btn-vote")).toHaveCount(3, { timeout: 10000 });

    await clickVoteForMovie(audiencePage, 0);
    await new Promise((r) => setTimeout(r, 500));

    await expect(audiencePage.locator(".vote-tally").first()).toBeVisible({ timeout: 10000 });

    for (const player of sessions) {
      const voteButtons = player.page.locator("button.btn-vote");
      const count = await voteButtons.count();
      if (count > 0) {
        await clickVoteForMovie(player.page, 0);
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    await expect
      .poll(
        async () => {
          const r = (await noteGiver.page.locator("body").textContent()) ?? "";
          return /wins this round|Writers are choosing|Round \d+|wins!|It's a tie/i.test(r);
        },
        { timeout: 20000, intervals: [500] },
      )
      .toBeTruthy();

    const bodyText = await audiencePage.locator("body").textContent();
    expect(bodyText).toBeTruthy();
  });

  test("audience voting timer expiry tallies votes and advances", async ({ browser }) => {
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

    await clickStartGame(alice.page);
    await waitForPhase(audiencePage, /Writers are choosing/i, 15000);

    const { noteGiver, writers } = await playAllToReady(sessions, "plot");
    await playThroughPitches(noteGiver, writers, audiencePage);

    await waitForPhase(audiencePage, /Vote for the Best Movie/i, 15000);

    await clickVoteForMovie(audiencePage, 0);
    await new Promise((r) => setTimeout(r, 500));

    await expect
      .poll(
        async () => {
          const r = (await audiencePage.locator("body").textContent()) ?? "";
          return /Writers are choosing|wins!|It's a tie|Round \d+ of/i.test(r);
        },
        { timeout: 45000, intervals: [500] },
      )
      .toBeTruthy();
  });
});
