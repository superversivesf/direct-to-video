export const VERSION = "2.1.0";

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
  isNoteGiver: boolean;
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
  noteGiverId: string | null;
  currentPitcherId: string | null;
  deck: {
    plot: Card[];
    character: Card[];
    note: Card[];
  };
  noteGiverNotes: Card[];
  movies: Movie[];
  timer: TimerState;
  round: {
    current: number;
  };
  totalRounds: number;
  noteGiverOrder: string[];
  noteGiverIndex: number;
  pitchOrder: string[];
  currentPitchIndex: number;
  votes: Record<string, string>;
  votingActive: boolean;
  roundWinnerId: string | null;
  franchiseEnabled: boolean;
}

export interface PublicPlayer {
  id: string;
  name: string;
  isNoteGiver: boolean;
  isHost: boolean;
  score: number;
  isDisconnected: boolean;
}

export interface PublicRoomState {
  code: string;
  phase: Phase;
  players: PublicPlayer[];
  noteGiverId: string | null;
  currentPitcherId: string | null;
  timer: TimerState;
  round: { current: number };
  totalRounds: number;
  movies: Movie[];
  myPlayerId: string | null;
  myHand: Card[] | null;
  myChosenCard: Card | null;
  myMovieReady: boolean;
  myMovieRevealed: boolean;
  myBlindCard: Card | null;
  myNoteGiverNotes: Card[] | null;
  votingActive: boolean;
  voteCounts: { playerId: string; votes: number }[];
  myVote: string | null;
  audienceCount: number;
  roundWinnerId: string | null;
  franchiseEnabled: boolean;
}

export interface AudienceRoomState {
  code: string;
  phase: Phase;
  players: PublicPlayer[];
  noteGiverId: string | null;
  currentPitcherId: string | null;
  timer: TimerState;
  round: { current: number };
  totalRounds: number;
  movies: Movie[];
  scoreboard: { playerId: string; name: string; score: number }[];
  votingActive: boolean;
  voteCounts: { playerId: string; votes: number }[];
  hasVoted: boolean;
  roundWinnerId: string | null;
  franchiseEnabled: boolean;
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
  start_game: () => void;
  set_franchise_enabled: (enabled: boolean) => void;
  set_total_rounds: (rounds: number) => void;
  kick_player: (playerId: string) => void;
  play_again: () => void;
  join_audience: (code: string) => void;
  cast_vote: (playerId: string) => void;
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
  round_started: (roundNumber: number) => void;
  game_ended: (scoreboard: { playerId: string; name: string; score: number }[]) => void;
  error: (message: string) => void;
  audience_joined: (state: AudienceRoomState) => void;
  audience_update: (state: AudienceRoomState) => void;
  voting_started: (secondsRemaining: number) => void;
  vote_update: (voteCounts: { playerId: string; votes: number }[]) => void;
  voting_ended: (roundWinnerId: string | null) => void;
  kicked: () => void;
}
