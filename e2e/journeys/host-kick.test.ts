import { test, expect } from "@playwright/test";
import { createPlayer, clickKickPlayerByName, cleanup, type PlayerSession } from "../helpers.js";

test.describe("Host kick journey", () => {
  let sessions: PlayerSession[] = [];
  let extraPages: any[] = [];

  test.afterEach(() => {
    cleanup(sessions, extraPages);
    sessions = [];
    extraPages = [];
  });

  test("host kicks a player from the lobby, kicked player sees removed message", async ({
    browser,
  }) => {
    test.setTimeout(60000);

    const alice = await createPlayer(browser, "", "Alice");
    sessions.push(alice);
    const roomCode = alice.roomCode;

    const bob = await createPlayer(browser, roomCode, "Bob");
    sessions.push(bob);

    const charlie = await createPlayer(browser, roomCode, "Charlie");
    sessions.push(charlie);

    // Alice is host (first player), should see kick buttons next to non-host players
    await expect(alice.page.locator("button.btn-kick").first()).toBeVisible({ timeout: 5000 });

    // Bob and Charlie should NOT have kick buttons (they're not hosts)
    const bobKickButtons = await bob.page.locator("button.btn-kick").count();
    expect(bobKickButtons).toBe(0);

    // Alice kicks Bob by name
    await clickKickPlayerByName(alice.page, "Bob");

    // Bob should see a "removed from the room" error message
    await expect(bob.page.locator(".error-banner")).toBeVisible({ timeout: 5000 });
    const bobError = await bob.page.locator(".error-banner").textContent();
    expect(bobError).toMatch(/removed from the room/i);

    // Bob should see a Reload button
    await expect(bob.page.locator("text=Reload")).toBeVisible({ timeout: 5000 });

    // Alice and Charlie should still be in the lobby
    // Charlie should no longer see Bob in the player list
    const charlieBody = await charlie.page.locator("body").textContent();
    expect(charlieBody).toContain("Alice");
    expect(charlieBody).toContain("Charlie");
    expect(charlieBody).not.toContain("Bob");

    // Alice should also see Bob removed
    const aliceBody = await alice.page.locator("body").textContent();
    expect(aliceBody).not.toContain("Bob");
  });

  test("host cannot kick self or other hosts", async ({ browser }) => {
    test.setTimeout(60000);

    const alice = await createPlayer(browser, "", "Alice");
    sessions.push(alice);
    const roomCode = alice.roomCode;

    const bob = await createPlayer(browser, roomCode, "Bob");
    sessions.push(bob);

    // Alice is the only host. She should see exactly 1 kick button (for Bob).
    const kickButtons = await alice.page.locator("button.btn-kick").count();
    expect(kickButtons).toBe(1);

    // Alice should not have a kick button next to her own name
    // The kick button should be for Bob only
    const aliceLi = alice.page.locator(".player-list li", { hasText: "Alice" });
    const aliceKickButton = await aliceLi.locator("button.btn-kick").count();
    expect(aliceKickButton).toBe(0);

    // Kick Bob by name — verifies the button works
    await clickKickPlayerByName(alice.page, "Bob");
    await expect(bob.page.locator(".error-banner")).toBeVisible({ timeout: 5000 });
  });
});
