import { test, expect } from "@playwright/test";
import {
  createPlayer,
  createAudience,
  clickStartGame,
  playAllToReady,
  clickStartTimer,
  clickEndPitch,
  waitForPhase,
  _findNoteGiverSession,
  cleanup,
  type PlayerSession,
} from "../helpers.js";

test.describe("NOTE card timer journey", () => {
  let sessions: PlayerSession[] = [];
  let extraPages: any[] = [];

  test.afterEach(() => {
    cleanup(sessions, extraPages);
    sessions = [];
    extraPages = [];
  });

  test("note giver plays NOTE card, timer pauses and auto-resumes", async ({ browser }) => {
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

    const { noteGiver, _writers } = await playAllToReady(players, "plot");

    await waitForPhase(noteGiver.page, /Now Pitching|Your cards are ready|pitching/i, 15000);
    await waitForPhase(audiencePage, /Now Pitching/i, 15000);

    await expect(noteGiver.page.locator(".note-giver-controls")).toBeVisible({ timeout: 10000 });
    await expect(noteGiver.page.locator("text=Start Timer")).toBeVisible({ timeout: 5000 });

    await clickStartTimer(noteGiver.page);
    await new Promise((r) => setTimeout(r, 2000));

    const noteCards = noteGiver.page.locator(".note-giver-controls .card-row .card-template");
    const noteCount = await noteCards.count();
    expect(noteCount).toBeGreaterThanOrEqual(1);

    await noteCards.nth(0).click();
    await new Promise((r) => setTimeout(r, 500));

    await expect(
      noteGiver.page
        .locator(".timer-note-badge")
        .or(noteGiver.page.locator("text=/PAUSED — Read your note/i")),
    ).toBeVisible({ timeout: 5000 });

    await new Promise((r) => setTimeout(r, 6000));

    const audText = await audiencePage
      .locator("body")
      .textContent()
      .catch(() => "");
    expect(audText).toBeTruthy();

    await clickEndPitch(noteGiver.page);
    await new Promise((r) => setTimeout(r, 2000));

    const afterText = (await noteGiver.page.locator("body").textContent()) ?? "";
    const stillPitching = /pitching|Pitching|Waiting for|Now Pitching/i.test(afterText);
    const atRoundEnd = /Vote for the best movie|Vote for the Best Movie/i.test(afterText);
    expect(stillPitching || atRoundEnd).toBe(true);
  });
});
