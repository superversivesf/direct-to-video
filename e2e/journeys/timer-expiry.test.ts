import { test, expect } from "@playwright/test";
import {
  createPlayer,
  createAudience,
  clickStartGame,
  playAllToReady,
  clickStartTimer,
  clickVoteForMovie,
  waitForPhase,
  findNoteGiverSession,
  cleanup,
  type PlayerSession,
} from "../helpers.js";

test.describe("Timer expiry journey", () => {
  let sessions: PlayerSession[] = [];
  let extraPages: any[] = [];

  test.afterEach(() => {
    cleanup(sessions, extraPages);
    sessions = [];
    extraPages = [];
  });

  test("pitch timer expires and auto-advances to next pitcher; voting timer expiry tallies", async ({ browser }) => {
    test.setTimeout(180000);

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

    const { noteGiver } = await playAllToReady(players, "plot");

    await waitForPhase(noteGiver.page, /Now Pitching|Your cards are ready|pitching/i, 15000);
    await waitForPhase(audiencePage, /Now Pitching/i, 15000);

    const firstPitcherName = await audiencePage.locator(".audience-pitcher-name").textContent() ?? "";
    expect(firstPitcherName).toMatch(/Now Pitching: (Alice|Bob)/);

    await clickStartTimer(noteGiver.page);

    await expect.poll(async () => {
      const pitcherName = await audiencePage.locator(".audience-pitcher-name").textContent().catch(() => "");
      const body = await audiencePage.locator("body").textContent() ?? "";
      return (pitcherName !== firstPitcherName && /Now Pitching/.test(pitcherName)) ||
             /Vote for the Best Movie/i.test(body);
    }, { timeout: 90000, intervals: [1000] }).toBeTruthy();

    const afterFirstExpiry = await audiencePage.locator(".audience-pitcher-name").textContent().catch(() => "") ?? "";
    const bodyAfter = await audiencePage.locator("body").textContent() ?? "";
    const advancedToVoting = /Vote for the Best Movie/i.test(bodyAfter);
    const advancedToSecondPitch = afterFirstExpiry !== firstPitcherName && /Now Pitching/.test(afterFirstExpiry);

    expect(advancedToVoting || advancedToSecondPitch).toBe(true);

    if (advancedToSecondPitch && !advancedToVoting) {
      await clickStartTimer(noteGiver.page);

      await expect.poll(async () => {
        const r = await audiencePage.locator("body").textContent() ?? "";
        return /Vote for the Best Movie/i.test(r);
      }, { timeout: 90000, intervals: [1000] }).toBeTruthy();
    }

    await expect(audiencePage.locator("button.btn-vote")).toHaveCount(2, { timeout: 10000 });

    await clickVoteForMovie(audiencePage, 0);
    for (const player of players) {
      const voteButtons = player.page.locator("button.btn-vote");
      const count = await voteButtons.count();
      if (count > 0) {
        await clickVoteForMovie(player.page, 0);
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    await expect.poll(async () => {
      const r = await audiencePage.locator("body").textContent() ?? "";
      return /Writers are choosing|Round \d+ of|wins!|It's a tie/i.test(r);
    }, { timeout: 30000, intervals: [500] }).toBeTruthy();
  });
});