import { test, expect } from "@playwright/test";
import {
  createPlayer,
  clickStartGame,
  playAllToReady,
  clickStartTimer,
  waitForPhase,
  findNoteGiverSession,
  findWriterSessions,
  cleanup,
  type PlayerSession,
} from "../helpers.js";

test.describe("Reconnection journey", () => {
  let sessions: PlayerSession[] = [];
  let extraPages: any[] = [];

  test.afterEach(() => {
    cleanup(sessions, extraPages);
    sessions = [];
    extraPages = [];
  });

  test("player disconnects and rejoins with same name", async ({ browser }) => {
    test.setTimeout(120000);

    const alice = await createPlayer(browser, "", "Alice");
    sessions.push(alice);
    const roomCode = alice.roomCode;

    const bob = await createPlayer(browser, roomCode, "Bob");
    sessions.push(bob);

    const charlie = await createPlayer(browser, roomCode, "Charlie");
    sessions.push(charlie);

    await clickStartGame(alice.page);
    await waitForPhase(alice.page, /Round 1|Choose your deck|You are/i, 10000);

    const { noteGiver } = await playAllToReady(sessions, "plot");

    await waitForPhase(noteGiver.page, /Now Pitching|Your cards are ready|pitching/i, 15000);

    await clickStartTimer(noteGiver.page);
    await new Promise((r) => setTimeout(r, 1000));

    const writers = sessions.filter((s) => s !== noteGiver);
    const disconnectTarget = writers[0];
    const disconnectedName = disconnectTarget.name;

    await disconnectTarget.page.close();
    sessions = sessions.filter((s) => s !== disconnectTarget);

    await new Promise((r) => setTimeout(r, 2000));

    const rejoinPage = await browser.newPage();
    extraPages.push(rejoinPage);
    await rejoinPage.goto("http://localhost:3100");
    await rejoinPage.fill('input[placeholder*="Room Code"]', roomCode);
    await rejoinPage.fill('input[placeholder*="Your Name"]', disconnectedName);
    await rejoinPage.click("text=Join as Player");
    await rejoinPage.waitForURL("**/room/**", { timeout: 10000 });
    await rejoinPage.waitForSelector(".game-view", { timeout: 10000 });

    const rejoinText = await rejoinPage.locator("body").textContent();
    expect(rejoinText).toMatch(/Round|pitching|cards are ready|Leave Game|You are a Writer|You are the Note Giver|Build Movie|Choose your deck|Now Pitching|Vote/i);

    await rejoinPage.close();
    extraPages = extraPages.filter((p) => p !== rejoinPage);
  });
});