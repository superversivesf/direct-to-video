import { test, expect } from "@playwright/test";
import {
  createPlayer,
  clickStartGame,
  clickDrawCards,
  waitForPhase,
  uncheckFranchise,
  cleanup,
  type PlayerSession,
} from "../helpers.js";

test.describe("Note giver setup UX journey", () => {
  let sessions: PlayerSession[] = [];
  let extraPages: any[] = [];

  test.afterEach(() => {
    cleanup(sessions, extraPages);
    sessions = [];
    extraPages = [];
  });

  test("note giver sees live writer readiness indicators and progress bar during setup", async ({
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

    const dave = await createPlayer(browser, roomCode, "Dave");
    sessions.push(dave);

    await uncheckFranchise(alice.page);
    await clickStartGame(alice.page);
    await waitForPhase(alice.page, /Round 1|Choose your deck|You are/i, 10000);

    // Identify the note giver
    let noteGiver: PlayerSession | null = null;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      for (const s of sessions) {
        const body = await s.page.locator("body").textContent();
        if (body && body.includes("You are the Note Giver")) {
          noteGiver = s;
          break;
        }
      }
      if (noteGiver) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(noteGiver).toBeTruthy();
    const writers = sessions.filter((s) => s !== noteGiver);

    // The note giver needs to draw their own cards first (they're also a writer)
    await clickDrawCards(noteGiver!.page, "plot");
    await noteGiver!.page.waitForSelector(".card-row .card-template", { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 500));

    // After drawing, the note giver sees "Waiting for writers" + progress bar
    const ngBodyAfterDraw = await noteGiver!.page.locator("body").textContent();
    expect(ngBodyAfterDraw).toMatch(/Waiting for writers/i);
    expect(ngBodyAfterDraw).toMatch(/0 of 3 writers ready/i);

    // Have one writer draw cards and select a card (becomes "ready")
    await clickDrawCards(writers[0].page, "plot");
    await writers[0].page.waitForSelector(".card-row .card-template", { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 300));
    await writers[0].page.click(".card-row .card-template >> nth=0");
    await new Promise((r) => setTimeout(r, 1000));

    // The note giver should now see "1 of 3 writers ready" and a ✓ ready indicator
    const ngBodyAfterOneReady = await noteGiver!.page.locator("body").textContent();
    expect(ngBodyAfterOneReady).toMatch(/1 of 3 writers ready/i);
    expect(ngBodyAfterOneReady).toContain("✓ ready");

    // Have the second writer ready up
    await clickDrawCards(writers[1].page, "plot");
    await writers[1].page.waitForSelector(".card-row .card-template", { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 300));
    await writers[1].page.click(".card-row .card-template >> nth=0");
    await new Promise((r) => setTimeout(r, 1000));

    const ngBodyAfterTwoReady = await noteGiver!.page.locator("body").textContent();
    expect(ngBodyAfterTwoReady).toMatch(/2 of 3 writers ready/i);

    // Have the third writer ready up — should now show 3 of 3
    await clickDrawCards(writers[2].page, "plot");
    await writers[2].page.waitForSelector(".card-row .card-template", { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 300));
    await writers[2].page.click(".card-row .card-template >> nth=0");
    await new Promise((r) => setTimeout(r, 1000));

    const ngBodyAfterAllReady = await noteGiver!.page.locator("body").textContent();
    expect(ngBodyAfterAllReady).toMatch(/3 of 3 writers ready/i);

    // The note giver also needs to select their card and ready up
    await noteGiver!.page.waitForSelector(".card-row .card-template", { timeout: 10000 });
    await noteGiver!.page.click(".card-row .card-template >> nth=0");
    await new Promise((r) => setTimeout(r, 1000));

    // Click Ready to Pitch on all players
    for (const s of sessions) {
      const hasReady = await s.page.locator("text=Ready to Pitch").count();
      if (hasReady > 0) {
        await s.page.locator("button.btn-ready:not([disabled])").click({ timeout: 10000 });
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    // Phase should advance to pitching
    await waitForPhase(noteGiver!.page, /Now Pitching|Your cards are ready|pitching/i, 15000);
  });
});
