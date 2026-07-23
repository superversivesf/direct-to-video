import { test, expect } from "@playwright/test";
import {
  createPlayer,
  createAudience,
  clickStartGame,
  clickStartTimer,
  clickEndPitch,
  clickVoteForMovie,
  clickDrawCards,
  waitForPhase,
  uncheckFranchise,
  cleanup,
  type PlayerSession,
} from "../helpers.js";

test.describe("Force-start journey", () => {
  let sessions: PlayerSession[] = [];
  let extraPages: any[] = [];

  test.afterEach(() => {
    cleanup(sessions, extraPages);
    sessions = [];
    extraPages = [];
  });

  test("host force-starts when writers are unprepared, game advances to pitching", async ({
    browser,
  }) => {
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

    await waitForPhase(alice.page, /Draw PLOT cards|Draw CHARACTER cards/i, 10000);

    await clickDrawCards(bob.page, "plot");
    await bob.page.waitForSelector(".card-row .card-template", { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 300));
    await bob.page.click(".card-row .card-template >> nth=0");
    await new Promise((r) => setTimeout(r, 500));
    const bobHasReady = await bob.page.locator("text=Ready to Pitch").count();
    if (bobHasReady > 0) {
      await bob.page.locator("text=Ready to Pitch").click({ timeout: 10000 });
      await new Promise((r) => setTimeout(r, 500));
    }

    let noteGiverName: string | null = null;
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      for (const s of sessions) {
        const body = await s.page.locator("body").textContent();
        if (body && body.includes("You are the Note Giver")) {
          noteGiverName = s.name;
          break;
        }
      }
      if (noteGiverName) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(noteGiverName).toBeTruthy();

    await expect(alice.page.locator("text=Force Start")).toBeVisible({ timeout: 5000 });

    await alice.page.click("text=Force Start");
    await new Promise((r) => setTimeout(r, 2000));

    for (const s of sessions) {
      await waitForPhase(s.page, /Now Pitching|Your cards are ready|pitching/i, 15000);
    }
    await waitForPhase(audiencePage, /Now Pitching/i, 15000);

    const noteGiverSession = sessions.find((s) => s.name === noteGiverName)!;
    const writers = sessions.filter((s) => s !== noteGiverSession);
    const totalPitches = writers.length + 1;

    for (let p = 0; p < totalPitches; p++) {
      await clickStartTimer(noteGiverSession.page);
      await new Promise((r) => setTimeout(r, 700));
      await clickEndPitch(noteGiverSession.page);
      await new Promise((r) => setTimeout(r, 600));
      if (p < totalPitches - 1) {
        await waitForPhase(audiencePage, /Now Pitching/i, 15000);
      }
    }

    await waitForPhase(noteGiverSession.page, /Vote for the best movie/i, 15000);

    for (const player of sessions) {
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
          const r = (await noteGiverSession.page.locator("body").textContent()) ?? "";
          return /wins this round|Writers are choosing|Round \d+ of|wins!|It's a tie/i.test(r);
        },
        { timeout: 20000, intervals: [500] },
      )
      .toBeTruthy();
  });
});
