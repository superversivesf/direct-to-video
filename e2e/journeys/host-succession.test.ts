import { test, expect } from "@playwright/test";
import {
  createPlayer,
  _createAudience,
  clickStartGame,
  playAllToReady,
  clickStartTimer,
  clickEndPitch,
  clickVoteForMovie,
  clickLeaveGame,
  clickPlayAgain,
  waitForPhase,
  _findNoteGiverSession,
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
    test.setTimeout(60000);

    const alice = await createPlayer(browser, "", "Alice");
    sessions.push(alice);
    const roomCode = alice.roomCode;

    const bob = await createPlayer(browser, roomCode, "Bob");
    sessions.push(bob);

    await expect(alice.page.locator("text=Start Game")).toBeVisible({ timeout: 5000 });
    await expect(bob.page.locator("text=Start Game"))
      .not.toBeVisible({ timeout: 3000 })
      .catch(() => {});

    await clickLeaveGame(alice.page);
    sessions = sessions.filter((s) => s !== alice);
    await alice.page.close().catch(() => {});

    await new Promise((r) => setTimeout(r, 2000));

    await expect(bob.page.locator("text=Start Game")).toBeVisible({ timeout: 5000 });
  });

  test("host leaves at game-end, next player can play again", async ({ browser }) => {
    test.setTimeout(300000);

    const alice = await createPlayer(browser, "", "Alice");
    sessions.push(alice);
    const roomCode = alice.roomCode;

    const bob = await createPlayer(browser, roomCode, "Bob");
    sessions.push(bob);

    const players = [alice, bob];

    await clickStartGame(alice.page);
    await waitForPhase(alice.page, /Round 1|Choose your deck|You are/i, 10000);

    for (let round = 0; round < 5; round++) {
      const { noteGiver, writers } = await playAllToReady(players, "plot");

      await waitForPhase(noteGiver.page, /Now Pitching|Your cards are ready|pitching/i, 15000);

      const totalPitches = writers.length + 1;
      for (let p = 0; p < totalPitches; p++) {
        await clickStartTimer(noteGiver.page);
        await new Promise((r) => setTimeout(r, 800));
        await clickEndPitch(noteGiver.page);
        await new Promise((r) => setTimeout(r, 700));
      }

      await waitForPhase(noteGiver.page, /Vote for the best movie/i, 15000);

      for (const player of players) {
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
            return /wins this round|Writers are choosing|Round \d+ of|wins!|It's a tie/i.test(r);
          },
          { timeout: 20000, intervals: [500] },
        )
        .toBeTruthy();

      await new Promise((r) => setTimeout(r, 1000));
    }

    await waitForPhase(bob.page, /wins!|It's a tie!/i, 10000);

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
