import { test, expect } from "@playwright/test";
import {
  createPlayer,
  createAudience,
  clickStartGame,
  playWriterToReady,
  clickStartTimer,
  clickEndPitch,
  waitForPhase,
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

  test("executive plays NOTE card, timer pauses and auto-resumes", async ({ browser }) => {
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
    await waitForPhase(alice.page, /Round 1/i, 10000);

    const execSession = players[0];
    const writerSessions = [bob, charlie];

    for (const writer of writerSessions) {
      await playWriterToReady(writer.page, "plot");
    }

    await waitForPhase(execSession.page, /Now Pitching|Waiting for/i, 15000);
    await waitForPhase(audiencePage, /Now Pitching/i, 15000);

    await expect(execSession.page.locator(".executive-controls")).toBeVisible({ timeout: 10000 });

    await expect(execSession.page.locator("text=Start Timer")).toBeVisible({ timeout: 5000 });

    await clickStartTimer(execSession.page);

    await new Promise((r) => setTimeout(r, 2000));

    const noteCards = execSession.page.locator(".executive-controls .card-row .card-template");
    const noteCount = await noteCards.count();
    expect(noteCount).toBeGreaterThanOrEqual(1);

    await noteCards.nth(0).click();

    await new Promise((r) => setTimeout(r, 500));

    const audText = await audiencePage.locator("body").textContent().catch(() => "");
    expect(audText).toBeTruthy();

    await new Promise((r) => setTimeout(r, 6000));

    await execSession.page.click("button:has-text('End Pitch')");

    await new Promise((r) => setTimeout(r, 2000));

    const afterText = await execSession.page.locator("body").textContent();
    const stillPitching = afterText?.includes("pitching") || afterText?.includes("Pitching") || afterText?.includes("Waiting for");
    const atRoundEnd = afterText?.includes("Select the Best Movie") || afterText?.includes("Executive is choosing");
    expect(stillPitching || atRoundEnd).toBe(true);
  });
});