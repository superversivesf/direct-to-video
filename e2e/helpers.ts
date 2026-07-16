import type { Page, Browser } from "@playwright/test";

const BASE = "http://localhost:3100";

export interface PlayerSession {
  page: Page;
  roomCode: string;
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
  return { page, roomCode: extractedCode || roomCode };
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

export async function clickStartTimer(page: Page): Promise<void> {
  await page.click("text=Start Timer");
}

export async function clickPauseTimer(page: Page): Promise<void> {
  await page.click("text=Pause Timer");
}

export async function clickEndPitch(page: Page): Promise<void> {
  await page.click("text=End Pitch");
}

export async function clickPickWinner(page: Page, index: number): Promise<void> {
  const buttons = page.locator("text=Pick This Movie");
  await buttons.nth(index).click();
}

export async function clickPlayAgain(page: Page): Promise<void> {
  await page.click("text=Play Again");
}

export async function clickLeaveGame(page: Page): Promise<void> {
  await page.click(".btn-leave");
}

export async function clickStartVoting(page: Page): Promise<void> {
  await page.click("text=Start Audience Voting");
}

export async function clickEndVoting(page: Page): Promise<void> {
  await page.click("text=End Voting");
}

export async function clickVoteForMovie(audiencePage: Page, index: number): Promise<void> {
  const voteButtons = audiencePage.locator("text=Vote for this movie");
  await voteButtons.nth(index).click();
}

export async function playWriterToReady(page: Page, deckType: "plot" | "character" = "plot"): Promise<void> {
  await page.waitForSelector(`text=Draw ${deckType.toUpperCase()} cards`, { timeout: 15000 });
  await clickDrawCards(page, deckType);
  await page.waitForSelector(".card-row .card-template", { timeout: 10000 });
  await clickSelectFirstCard(page);
  await new Promise((r) => setTimeout(r, 500));
}

export function cleanup(sessions: PlayerSession[], pages: Page[]): void {
  for (const s of sessions) {
    s.page.close();
  }
  for (const p of pages) {
    p.close();
  }
}