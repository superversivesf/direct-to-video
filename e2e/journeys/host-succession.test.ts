import { test, expect } from "@playwright/test";
import {
  createPlayer,
  createAudience,
  clickStartGame,
  playWriterToReady,
  clickStartTimer,
  clickEndPitch,
  clickPickWinner,
  clickLeaveGame,
  clickPlayAgain,
  waitForPhase,
  cleanup,
  type PlayerSession,
} from "../helpers.js";

test.describe("Host succession journey", () => {
  let sessions: PlayerSession[] = [];
  let extraPages: any[] = [];

  test.afterEach(() => {
    cleanup(sessions, extraPages);
    sessions = [];
    extraPages = [];
  });

  test("host leaves lobby, next player promoted to host", async ({ browser }) => {
    test.setTimeout(120000);

    const alice = await createPlayer(browser, "", "Alice");
    sessions.push(alice);
    const roomCode = alice.roomCode;

    const bob = await createPlayer(browser, roomCode, "Bob");
    sessions.push(bob);

    await expect(alice.page.locator("text=Start Game")).toBeVisible({ timeout: 5000 });
    await expect(bob.page.locator("text=Start Game")).not.toBeVisible({ timeout: 3000 }).catch(() => {});

    await clickLeaveGame(alice.page);
    sessions = sessions.filter((s) => s !== alice);
    await alice.page.close().catch(() => {});

    await new Promise((r) => setTimeout(r, 2000));

    await expect(bob.page.locator("text=Start Game")).toBeVisible({ timeout: 5000 });
  });

  test("host leaves at game-end, next player can play again", async ({ browser }) => {
    test.setTimeout(180000);

    const alice = await createPlayer(browser, "", "Alice");
    sessions.push(alice);
    const roomCode = alice.roomCode;

    const bob = await createPlayer(browser, roomCode, "Bob");
    sessions.push(bob);

    const players = [alice, bob];

    await clickStartGame(alice.page);
    await waitForPhase(alice.page, /Round 1/i, 10000);

    for (let round = 0; round < 2; round++) {
      const execSession = players[round];
      const writerSession = players[round === 0 ? 1 : 0];

      await playWriterToReady(writerSession.page, "plot");

      await waitForPhase(execSession.page, /Now Pitching|Waiting for/i, 15000);

      await clickStartTimer(execSession.page);
      await new Promise((r) => setTimeout(r, 1000));
      await clickEndPitch(execSession.page);

      await waitForPhase(execSession.page, /Select the Best Movie|Executive is choosing/i, 10000);

      await clickPickWinner(execSession.page, 0);
      await new Promise((r) => setTimeout(r, 1500));
    }

    await waitForPhase(bob.page, /wins!|tie!/i, 10000);

    await expect(alice.page.locator("text=Play Again")).toBeVisible({ timeout: 10000 });

    await clickLeaveGame(alice.page);
    sessions = sessions.filter((s) => s !== alice);
    await alice.page.close().catch(() => {});

    await new Promise((r) => setTimeout(r, 2000));

    await expect(bob.page.locator("text=Play Again")).toBeVisible({ timeout: 5000 });

    await clickPlayAgain(bob.page);
    await waitForPhase(bob.page, /Start Game|lobby/i, 10000);
  });
});