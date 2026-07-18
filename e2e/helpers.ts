import type { Page, Browser } from "@playwright/test";

const BASE = "http://localhost:3100";

export interface PlayerSession {
  page: Page;
  roomCode: string;
  name: string;
}

export async function createPlayer(browser: Browser, roomCode: string, name: string): Promise<PlayerSession> {
  const page = await browser.newPage();
  await page.goto(BASE, { timeout: 30000 });
  await page.waitForSelector('input[placeholder*="Room Code"]', { timeout: 30000 });
  await page.fill('input[placeholder*="Room Code"]', roomCode);
  await page.fill('input[placeholder*="Your Name"]', name);
  await page.click("text=Join as Player");
  await page.waitForURL("**/room/**", { timeout: 15000 });
  await page.waitForSelector(".game-view", { timeout: 15000 });

  const code = await page.locator("h1").textContent();
  const extractedCode = code?.match(/Room ([A-Z]{4})/)?.[1] || "";
  return { page, roomCode: extractedCode || roomCode, name };
}

export async function createAudience(browser: Browser, roomCode: string): Promise<Page> {
  const page = await browser.newPage();
  await page.goto(BASE);
  await page.fill('input[placeholder*="Room Code"]', roomCode);
  await page.click("text=Join as Audience");
  await page.waitForURL(`**/audience/${roomCode}`, { timeout: 10000 });
  await page.waitForSelector(".audience-view", { timeout: 10000 });
  return page;
}

export async function waitForPhase(page: Page, text: string | RegExp, timeout = 20000): Promise<void> {
  if (text instanceof RegExp) {
    await page.waitForSelector(`text=/${text.source}/i`, { timeout });
  } else {
    await page.waitForSelector(`text=${text}`, { timeout });
  }
}

export async function clickStartGame(page: Page): Promise<void> {
  await page.click("text=Start Game");
}

export async function clickDrawCards(page: Page, deckType: "plot" | "character"): Promise<void> {
  await page.click(`text=Draw ${deckType.toUpperCase()} cards`);
}

export async function clickSelectFirstCard(page: Page): Promise<void> {
  await page.waitForSelector(".card-row .card-template", { timeout: 10000 });
  await page.click(".card-row .card-template >> nth=0");
}

export async function clickReadyToPitch(page: Page): Promise<void> {
  await page.click("text=Ready to Pitch");
}

export async function clickStartTimer(page: Page): Promise<void> {
  await page.click("text=Start Timer");
}

export async function clickPauseTimer(page: Page): Promise<void> {
  await page.click("text=Pause Timer");
}

export async function clickEndPitch(page: Page): Promise<void> {
  await page.click("text=End Pitch");
}

export async function clickImDonePitching(page: Page): Promise<void> {
  await page.click("text=I'm Done Pitching");
}

export async function clickPlayAgain(page: Page): Promise<void> {
  await page.click("text=Play Again");
}

export async function clickLeaveGame(page: Page): Promise<void> {
  await page.click(".btn-leave");
}

export async function clickVoteForMovie(page: Page, index: number): Promise<void> {
  const voteButtons = page.locator("button.btn-vote");
  await voteButtons.nth(index).click();
}

export async function clickVoteForMovieByPlayerName(page: Page, playerName: string): Promise<void> {
  const movieSection = page.locator(".round-summary-movie, .audience-movie-card", {
    hasText: `${playerName}'s Movie`,
  });
  await movieSection.locator("button.btn-vote").click();
}

export async function clickKickPlayer(page: Page, playerIndex: number): Promise<void> {
  const kickButtons = page.locator("button.btn-kick");
  await kickButtons.nth(playerIndex).click();
}

export async function clickKickPlayerByName(page: Page, playerName: string): Promise<void> {
  const playerRow = page.locator(".player-list li", { hasText: playerName });
  await playerRow.locator("button.btn-kick").click();
}

export async function playWriterToReady(page: Page, deckType: "plot" | "character" = "plot"): Promise<void> {
  await page.waitForSelector(`text=Draw ${deckType.toUpperCase()} cards`, { timeout: 15000 });
  await clickDrawCards(page, deckType);
  await page.waitForSelector(".card-row .card-template", { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 300));
  await page.click(".card-row .card-template >> nth=0");

  await Promise.race([
    page.waitForSelector("text=Ready to Pitch", { timeout: 15000 }).catch(() => {}),
    page.waitForSelector(".timer", { timeout: 15000 }).catch(() => {}),
    page.waitForSelector("text=Your cards are ready", { timeout: 15000 }).catch(() => {}),
    page.waitForSelector("text=Now Pitching", { timeout: 15000 }).catch(() => {}),
    page.waitForSelector("text=Waiting for", { timeout: 15000 }).catch(() => {}),
  ]);

  await new Promise((r) => setTimeout(r, 500));

  const hasReady = await page.locator("text=Ready to Pitch").count();
  if (hasReady > 0) {
    await page.click("text=Ready to Pitch");
    await new Promise((r) => setTimeout(r, 500));
  }
}

export async function playAllToReady(
  sessions: PlayerSession[],
  deckType: "plot" | "character" = "plot"
): Promise<{ noteGiver: PlayerSession; writers: PlayerSession[] }> {
  await Promise.race([
    sessions[0].page.waitForSelector("text=Draw PLOT cards", { timeout: 20000 }).catch(() => {}),
    sessions[0].page.waitForSelector("text=Draw CHARACTER cards", { timeout: 20000 }).catch(() => {}),
  ]);

  const noteGiver = await findNoteGiverSession(sessions);
  const writers = sessions.filter((s) => s !== noteGiver);

  for (const writer of writers) {
    await playWriterToReady(writer.page, deckType);
  }

  await playWriterToReady(noteGiver.page, deckType);

  return { noteGiver, writers };
}

export async function findNoteGiverSession(sessions: PlayerSession[]): Promise<PlayerSession> {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    for (const s of sessions) {
      const body = await s.page.locator("body").textContent();
      if (body && body.includes("You are the Note Giver")) {
        return s;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("No note giver found among sessions");
}

export async function findWriterSessions(sessions: PlayerSession[]): Promise<PlayerSession[]> {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const writers: PlayerSession[] = [];
    for (const s of sessions) {
      const body = await s.page.locator("body").textContent();
      if (body && body.includes("You are a Writer")) {
        writers.push(s);
      }
    }
    if (writers.length > 0) return writers;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("No writer sessions found");
}

export async function setTotalRounds(page: Page, rounds: number): Promise<void> {
  await page.selectOption("select", String(rounds));
}

export async function uncheckFranchise(page: Page): Promise<void> {
  const checkbox = page.locator('input[type="checkbox"]');
  if (await checkbox.isChecked()) {
    await checkbox.uncheck();
  }
}

export function cleanup(sessions: PlayerSession[], pages: Page[]): void {
  for (const s of sessions) {
    s.page.close();
  }
  for (const p of pages) {
    p.close();
  }
}