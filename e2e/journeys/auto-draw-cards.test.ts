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
    await waitForPhase(alice.page, /Round 1/i, 10000);

    const execSession = players[0];
    const writerSession = players[1];

    await playWriterToReady(writerSession.page, "plot");

    await waitForPhase(execSession.page, /Now Pitching|Waiting for/i, 15000);
    await waitForPhase(audiencePage, /Now Pitching/i, 15000);

    await clickStartTimer(execSession.page);
    await new Promise((r) => setTimeout(r, 1000));

    const cardTexts = await writerSession.page.locator(".card-text").allTextContents();
    const hasUnderscores = cardTexts.some((t) => t.includes("____"));
    const hasSubstituted = cardTexts.some((t) => !t.includes("____") && t.length > 10);

    expect(hasSubstituted).toBe(true);

    await clickEndPitch(execSession.page);

    await waitForPhase(execSession.page, /Select the Best Movie|Executive is choosing/i, 10000);

    const roundSummaryText = await execSession.page.locator(".round-summary").textContent();
    expect(roundSummaryText).toBeTruthy();

    const audienceMovieText = await audiencePage.locator(".audience-movie-card").first().textContent().catch(() => "");
    expect(audienceMovieText).toBeTruthy();
  });
});