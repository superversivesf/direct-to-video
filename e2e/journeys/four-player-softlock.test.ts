import { test, expect } from "@playwright/test";
import {
  createPlayer,
  createAudience,
  clickStartGame,
  playWriterToReady,
  clickStartTimer,
  clickEndPitch,
  clickPickWinner,
  waitForPhase,
  cleanup,
  type PlayerSession,
} from "../helpers.js";

test.describe("4-player round 2 soft-lock regression", () => {
  let sessions: PlayerSession[] = [];
  let extraPages: any[] = [];

  test.afterEach(() => {
    cleanup(sessions, extraPages);
    sessions = [];
    extraPages = [];
  });

  test("4-player game round 2 does not soft-lock", async ({ browser }) => {
    test.setTimeout(180000);

    const p1 = await createPlayer(browser, "", "P1");
    sessions.push(p1);
    const roomCode = p1.roomCode;

    const p2 = await createPlayer(browser, roomCode, "P2");
    sessions.push(p2);

    const p3 = await createPlayer(browser, roomCode, "P3");
    sessions.push(p3);

    const p4 = await createPlayer(browser, roomCode, "P4");
    sessions.push(p4);

    const audiencePage = await createAudience(browser, roomCode);
    extraPages.push(audiencePage);

    const players = [p1, p2, p3, p4];

    await clickStartGame(p1.page);
    await waitForPhase(p1.page, /Round 1|Executive.*Waiting/i, 10000);
    await waitForPhase(audiencePage, /Writers are choosing/i, 10000);

    for (let round = 0; round < 4; round++) {
      const execSession = players[round];
      const writerSessions = players.filter((_, i) => i !== round);

      for (const writer of writerSessions) {
        await playWriterToReady(writer.page, "plot");
      }

      await waitForPhase(execSession.page, /Now Pitching|Waiting for/i, 15000);

      for (let p = 0; p < writerSessions.length; p++) {
        await clickStartTimer(execSession.page);
        await new Promise((r) => setTimeout(r, 1000));
        await clickEndPitch(execSession.page);
      }

      await waitForPhase(execSession.page, /Select the Best Movie|Executive is choosing/i, 10000);

      await clickPickWinner(execSession.page, 0);
      await new Promise((r) => setTimeout(r, 1500));

      if (round < 3) {
        await waitForPhase(audiencePage, /Writers are choosing/i, 10000);
      }
    }

    await waitForPhase(p1.page, /wins!|tie!/i, 10000);
    await expect(audiencePage.locator(".winner-spotlight")).toBeVisible({ timeout: 10000 });
  });
});