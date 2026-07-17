import { test, expect } from "@playwright/test";
import {
  createPlayer,
  clickStartGame,
  playWriterToReady,
  waitForPhase,
  cleanup,
  type PlayerSession,
} from "../helpers.js";

test.describe.skip("Reconnection journey", () => {
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

    const players = [alice, bob, charlie];

    await clickStartGame(alice.page);
    await waitForPhase(alice.page, /Round 1/i, 10000);

    const execSession = players[0];
    const writerSessions = [bob, charlie];

    for (const writer of writerSessions) {
      await playWriterToReady(writer.page, "plot");
    }

    await waitForPhase(execSession.page, /Now Pitching|Waiting for/i, 15000);

    await bob.page.close();
    sessions = sessions.filter((s) => s !== bob);

    await new Promise((r) => setTimeout(r, 2000));

    const rejoinPage = await browser.newPage();
    await rejoinPage.goto("http://localhost:3100");
    await rejoinPage.fill('input[placeholder*="Room Code"]', roomCode);
    await rejoinPage.fill('input[placeholder*="Your Name"]', "Bob");
    await rejoinPage.click("text=Join as Player");
    await rejoinPage.waitForURL("**/room/**", { timeout: 10000 });
    await rejoinPage.waitForSelector(".game-view", { timeout: 10000 });

    const rejoinText = await rejoinPage.locator("body").textContent();
    expect(rejoinText).toMatch(/Round|pitching|cards are ready|Leave Game/i);

    await rejoinPage.close();
  });
});