import Database from "better-sqlite3";
import type { Database as DB } from "better-sqlite3";
import type { Card, CardType, Room } from "@pitch-storm/shared";
import { nanoid } from "nanoid";
import { getSeedCards } from "./seed-cards.js";

export interface DbHandle {
  db: DB;
  saveRoom: (code: string, room: Room) => void;
  loadRoom: (code: string) => Room | null;
  getAllRooms: () => Room[];
  getCardDeck: (db: DB, type: CardType) => Card[];
  deleteRoom: (code: string) => void;
  loadRoomMeta: (code: string) => { updated_at: string } | null;
}

export function getCardDeck(db: DB, type: CardType): Card[] {
  const rows = db.prepare(`SELECT * FROM cards WHERE type = ?`).all(type) as Card[];
  return rows;
}

export function initDb(path: string = ":memory:"): DbHandle {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      code TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      text TEXT NOT NULL
    );
  `);

  const saveRoom = db.prepare(
    `INSERT INTO rooms (code, state) VALUES (?, ?)
     ON CONFLICT(code) DO UPDATE SET state = excluded.state, updated_at = datetime('now')`
  );

  const loadRoom = db.prepare(`SELECT state FROM rooms WHERE code = ?`);

  const allRooms = db.prepare(`SELECT state FROM rooms`);

  const deleteRoom = db.prepare(`DELETE FROM rooms WHERE code = ?`);

  const loadRoomMeta = db.prepare(`SELECT updated_at FROM rooms WHERE code = ?`);

  function saveRoomFn(code: string, room: Room) {
    saveRoom.run(code, JSON.stringify(room));
  }

  function loadRoomFn(code: string): Room | null {
    const row = loadRoom.get(code) as { state: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.state) as Room;
  }

  function getAllRoomsFn(): Room[] {
    const rows = allRooms.all() as { state: string }[];
    return rows.map((row) => JSON.parse(row.state) as Room);
  }

  function deleteRoomFn(code: string): void {
    deleteRoom.run(code);
  }

  function loadRoomMetaFn(code: string): { updated_at: string } | null {
    const row = loadRoomMeta.get(code) as { updated_at: string } | undefined;
    return row ?? null;
  }

  return { db, saveRoom: saveRoomFn, loadRoom: loadRoomFn, getAllRooms: getAllRoomsFn, getCardDeck, deleteRoom: deleteRoomFn, loadRoomMeta: loadRoomMetaFn };
}

export function seedCards(db: DB) {
  const existing = db.prepare(`SELECT COUNT(*) as count FROM cards`).get() as { count: number };
  if (existing.count > 0) return;

  const insert = db.prepare(`INSERT INTO cards (id, type, text) VALUES (?, ?, ?)`);
  const seeds = getSeedCards();

  const typeMap: Record<CardType, string[]> = {
    plot: seeds.plot,
    character: seeds.character,
    note: seeds.note,
  };

  for (const [type, texts] of Object.entries(typeMap)) {
    for (const text of texts) {
      insert.run(nanoid(12), type, text);
    }
  }
}