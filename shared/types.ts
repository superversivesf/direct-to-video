export type Phase = "lobby" | "setup" | "card-selection" | "pitching" | "round-end" | "game-end";

export type CardType = "plot" | "character" | "note";

export type DeckType = "plot" | "character";

export type DrawType = "character" | "plot" | "note";

export interface CardDraw {
  deck: DrawType;
  count: number;
}

export interface Card {
  id: string;
  type: CardType;
  text: string;
  header?: string;
  draws?: CardDraw[];
  substitutedText?: string;
  isFranchise?: boolean;
}

export interface Player {
  id: string;
  name: string;
  socketId: string | null;
  isExecutive: boolean;
  isHost: boolean;
  score: number;
  hand: Card[];
  chosenCard: Card | null;
  isDisconnected: boolean;
}

export interface Movie {
  playerId: string;
  chosenCard: Card;
  randomCard: Card;
  notesPlayed: Card[];
  revealed: boolean;
}

export interface TimerState {
  running: boolean;
  secondsRemaining: number;
  pausedAt: number | null;
  pausedForNote: boolean;
  noteResumeAt: number | null;
}

export interface Room {
  code: string;
  phase: Phase;
  players: Player[];
  executiveId: string | null;
  currentPitcherId: string | null;
  deck: {
    plot: Card[];
    character: Card[];
    note: Card[];
  };
  executiveNotes: Card[];
  movies: Movie[];
  timer: TimerState;
  round: {
    current: number;
    total: number;
  };
  pitchOrder: string[];
  currentPitchIndex: number;
}

export interface PublicPlayer {
  id: string;
  name: string;
  isExecutive: boolean;
  isHost: boolean;
  score: number;
  isDisconnected: boolean;
}

export interface PublicRoomState {
  code: string;
  phase: Phase;
  players: PublicPlayer[];
  executiveId: string | null;
  currentPitcherId: string | null;
  timer: TimerState;
  round: { current: number; total: number };
  movies: Movie[];
  myPlayerId: string | null;
  myHand: Card[] | null;
  myChosenCard: Card | null;
  myMovieReady: boolean;
  myMovieRevealed: boolean;
  myBlindCard: Card | null;
  myExecutiveNotes: Card[] | null;
}

export interface AudienceRoomState {
  code: string;
  phase: Phase;
  players: PublicPlayer[];
  executiveId: string | null;
  currentPitcherId: string | null;
  timer: TimerState;
  round: { current: number; total: number };
  movies: Movie[];
  scoreboard: { playerId: string; name: string; score: number }[];
}

export interface ClientToServerEvents {
  join_room: (code: string, name: string) => void;
  select_deck_type: (deckType: DeckType) => void;
  select_card: (cardId: string) => void;
  reveal_movie: () => void;
  start_timer: () => void;
  pause_timer: () => void;
  play_note: (noteCardId: string) => void;
  end_pitch: () => void;
  select_winner: (playerId: string) => void;
  start_game: () => void;
  play_again: () => void;
  join_audience: (code: string) => void;
}

export interface ServerToClientEvents {
  room_joined: (state: PublicRoomState) => void;
  player_list_updated: (players: PublicPlayer[]) => void;
  movie_revealed: (movie: Movie) => void;
  timer_started: (secondsRemaining: number) => void;
  timer_tick: (secondsRemaining: number) => void;
  timer_paused: (remainingSeconds: number) => void;
  timer_expired: () => void;
  note_played: (noteCard: Card, playerId: string) => void;
  pitch_ended: (playerId: string) => void;
  next_pitcher: (playerId: string) => void;
  winner_selected: (playerId: string, noteCard: Card | null) => void;
  round_started: (roundNumber: number) => void;
  game_ended: (scoreboard: { playerId: string; name: string; score: number }[]) => void;
  error: (message: string) => void;
  audience_joined: (state: AudienceRoomState) => void;
  audience_update: (state: AudienceRoomState) => void;
}