import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
const futureFlags = { v7_startTransition: true, v7_relativeSplatPath: true };
import { Game } from "../src/pages/Game.js";
import type { PublicRoomState } from "@direct-to-video/shared";

vi.mock("../src/socket.js", () => ({
  socket: { connect: vi.fn(), emit: vi.fn(), on: vi.fn(), off: vi.fn() },
}));

const mockFns = {
  joinRoom: vi.fn(),
  startGame: vi.fn(),
  selectDeckType: vi.fn(),
  selectCard: vi.fn(),
  revealMovie: vi.fn(),
  startTimer: vi.fn(),
  pauseTimer: vi.fn(),
  playNote: vi.fn(),
  endPitch: vi.fn(),
  castVote: vi.fn(),
  playAgain: vi.fn(),
  setFranchiseEnabled: vi.fn(),
  setTotalRounds: vi.fn(),
  kickPlayer: vi.fn(),
  leaveGame: vi.fn(),
};

const baseState: PublicRoomState = {
  code: "ABCD",
  phase: "lobby",
  players: [
    { id: "1", name: "Jason", isNoteGiver: false, isHost: true, score: 0, isDisconnected: false },
  ],
  noteGiverId: null,
  currentPitcherId: null,
  timer: {
    running: false,
    secondsRemaining: 45,
    pausedAt: null,
    pausedForNote: false,
    noteResumeAt: null,
  },
  round: { current: 0 },
  totalRounds: 5,
  movies: [],
  myPlayerId: "1",
  myHand: null,
  myChosenCard: null,
  myMovieReady: false,
  myMovieRevealed: false,
  myBlindCard: null,
  myNoteGiverNotes: null,
  votingActive: false,
  voteCounts: [],
  myVote: null,
  audienceCount: 0,
  roundWinnerId: null,
  franchiseEnabled: false,
};

let mockState: PublicRoomState = { ...baseState };
vi.mock("../src/hooks/useRoom.js", () => ({
  useRoom: () => ({ roomState: mockState, error: null, ...mockFns }),
}));

function setState(overrides: Partial<PublicRoomState>) {
  mockState = { ...baseState, ...overrides };
}

function renderGame() {
  return render(
    <MemoryRouter future={futureFlags}>
      <Game />
    </MemoryRouter>,
  );
}

describe("Game", () => {
  it("renders lobby phase with player list", () => {
    setState({ phase: "lobby" });
    renderGame();
    expect(screen.getByText("Players")).toBeTruthy();
    expect(screen.getByText(/Jason/)).toBeTruthy();
  });

  it("renders start game button for host in lobby", () => {
    setState({ phase: "lobby" });
    renderGame();
    expect(screen.getByText(/start game/i)).toBeTruthy();
  });

  it("does not render start game button for non-host in lobby", () => {
    setState({
      phase: "lobby",
      players: [
        {
          id: "2",
          name: "Bob",
          isNoteGiver: false,
          isHost: false,
          score: 0,
          isDisconnected: false,
        },
      ],
      myPlayerId: "2",
    });
    renderGame();
    expect(screen.queryByText(/start game/i)).toBeNull();
  });

  it("renders connecting state when roomState is null", () => {
    mockState = null as unknown as PublicRoomState;
    renderGame();
    expect(screen.getByText(/connecting/i)).toBeTruthy();
  });

  it("renders deck choice buttons for writer in setup with empty hand", () => {
    setState({
      phase: "setup",
      round: { current: 1 },
      totalRounds: 3,
      noteGiverId: "9",
      myPlayerId: "1",
      myHand: null,
    });
    renderGame();
    expect(screen.getByText(/draw plot cards/i)).toBeTruthy();
    expect(screen.getByText(/draw character cards/i)).toBeTruthy();
  });

  it("renders writer controls with hand during card-selection", () => {
    setState({
      phase: "card-selection",
      round: { current: 1 },
      totalRounds: 3,
      noteGiverId: "9",
      myPlayerId: "1",
      myHand: [
        { id: "c1", type: "plot", text: "Plot A" },
        { id: "c2", type: "plot", text: "Plot B" },
        { id: "c3", type: "plot", text: "Plot C" },
      ],
    });
    renderGame();
    expect(screen.getByText(/your hand/i)).toBeTruthy();
    expect(screen.getByText("Plot A")).toBeTruthy();
    expect(screen.getByText(/click a card to play it/i)).toBeTruthy();
  });

  it("calls selectCard when a hand card is clicked", () => {
    setState({
      phase: "card-selection",
      round: { current: 1 },
      totalRounds: 3,
      noteGiverId: "9",
      myPlayerId: "1",
      myHand: [
        { id: "c1", type: "plot", text: "Plot A" },
        { id: "c2", type: "plot", text: "Plot B" },
        { id: "c3", type: "plot", text: "Plot C" },
      ],
    });
    renderGame();
    fireEvent.click(screen.getByText("Plot A"));
    expect(mockFns.selectCard).toHaveBeenCalledWith("c1");
  });

  it("renders movie preview with face-down blind card after selecting", () => {
    setState({
      phase: "card-selection",
      round: { current: 1 },
      totalRounds: 3,
      noteGiverId: "9",
      myPlayerId: "1",
      myHand: [],
      myChosenCard: { id: "c2", type: "plot", text: "Plot B" },
      myMovieReady: true,
      myMovieRevealed: false,
      myBlindCard: null,
    });
    renderGame();
    expect(screen.getByText(/Your Movie/i)).toBeTruthy();
    expect(screen.getByText(/blind card will be revealed/i)).toBeTruthy();
  });

  it("renders note-giver waiting view during setup when player is note-giver", () => {
    setState({
      phase: "setup",
      round: { current: 1 },
      totalRounds: 3,
      noteGiverId: "1",
      myPlayerId: "1",
    });
    renderGame();
    expect(screen.getByText(/you are the note giver/i)).toBeTruthy();
  });

  it("renders pitching phase with timer and movie reveal", () => {
    setState({
      phase: "pitching",
      round: { current: 1 },
      totalRounds: 3,
      noteGiverId: "9",
      myPlayerId: "1",
      currentPitcherId: "1",
      timer: {
        running: true,
        secondsRemaining: 45,
        pausedAt: null,
        pausedForNote: false,
        noteResumeAt: null,
      },
      movies: [
        {
          playerId: "1",
          chosenCard: { id: "c1", type: "plot", text: "Plot A" },
          randomCard: { id: "r1", type: "character", text: "Char A" },
          notesPlayed: [],
          revealed: true,
        },
      ],
    });
    renderGame();
    expect(screen.getByText("YOUR TURN TO PITCH!")).toBeTruthy();
    expect(screen.getByText(/i'm done pitching/i)).toBeTruthy();
  });

  it("renders pitching phase from audience perspective with pitcher name", () => {
    setState({
      phase: "pitching",
      round: { current: 1 },
      totalRounds: 3,
      noteGiverId: "9",
      myPlayerId: "2",
      currentPitcherId: "1",
      players: [
        {
          id: "1",
          name: "Jason",
          isNoteGiver: false,
          isHost: true,
          score: 0,
          isDisconnected: false,
        },
        {
          id: "2",
          name: "Bob",
          isNoteGiver: false,
          isHost: false,
          score: 0,
          isDisconnected: false,
        },
        {
          id: "9",
          name: "NoteGiver",
          isNoteGiver: true,
          isHost: false,
          score: 0,
          isDisconnected: false,
        },
      ],
      timer: {
        running: true,
        secondsRemaining: 45,
        pausedAt: null,
        pausedForNote: false,
        noteResumeAt: null,
      },
      movies: [
        {
          playerId: "1",
          chosenCard: { id: "c1", type: "plot", text: "Plot A" },
          randomCard: { id: "r1", type: "character", text: "Char A" },
          notesPlayed: [],
          revealed: true,
        },
      ],
    });
    renderGame();
    expect(screen.getByText(/jason is pitching/i)).toBeTruthy();
  });

  it("renders note-giver controls for note-giver during pitching", () => {
    setState({
      phase: "pitching",
      round: { current: 1 },
      totalRounds: 3,
      noteGiverId: "1",
      myPlayerId: "1",
      currentPitcherId: "2",
      players: [
        {
          id: "1",
          name: "NoteGiver",
          isNoteGiver: true,
          isHost: false,
          score: 0,
          isDisconnected: false,
        },
        {
          id: "2",
          name: "Writer",
          isNoteGiver: false,
          isHost: true,
          score: 0,
          isDisconnected: false,
        },
      ],
      timer: {
        running: false,
        secondsRemaining: 45,
        pausedAt: null,
        pausedForNote: false,
        noteResumeAt: null,
      },
      movies: [
        {
          playerId: "2",
          chosenCard: { id: "c1", type: "plot", text: "Plot A" },
          randomCard: { id: "r1", type: "character", text: "Char A" },
          notesPlayed: [],
          revealed: true,
        },
      ],
      myNoteGiverNotes: [{ id: "n1", type: "note", text: "Note A" }],
    });
    renderGame();
    expect(screen.getByText(/Start the timer to enable Note cards/i)).toBeTruthy();
    expect(screen.getByText("Start Timer")).toBeTruthy();
    expect(screen.getByText("End Pitch")).toBeTruthy();
  });

  it("calls startTimer when start timer button clicked", () => {
    setState({
      phase: "pitching",
      round: { current: 1 },
      totalRounds: 3,
      noteGiverId: "1",
      myPlayerId: "1",
      currentPitcherId: "2",
      players: [
        {
          id: "1",
          name: "NoteGiver",
          isNoteGiver: true,
          isHost: false,
          score: 0,
          isDisconnected: false,
        },
        {
          id: "2",
          name: "Writer",
          isNoteGiver: false,
          isHost: true,
          score: 0,
          isDisconnected: false,
        },
      ],
      timer: {
        running: false,
        secondsRemaining: 45,
        pausedAt: null,
        pausedForNote: false,
        noteResumeAt: null,
      },
      movies: [
        {
          playerId: "2",
          chosenCard: { id: "c1", type: "plot", text: "Plot A" },
          randomCard: { id: "r1", type: "character", text: "Char A" },
          notesPlayed: [],
          revealed: true,
        },
      ],
      myNoteGiverNotes: [{ id: "n1", type: "note", text: "Note A" }],
    });
    renderGame();
    fireEvent.click(screen.getByText("Start Timer"));
    expect(mockFns.startTimer).toHaveBeenCalled();
  });

  it("renders round-end with vote buttons", () => {
    setState({
      phase: "round-end",
      round: { current: 1 },
      totalRounds: 3,
      noteGiverId: "9",
      myPlayerId: "1",
      votingActive: true,
      voteCounts: [],
      timer: {
        running: true,
        secondsRemaining: 15,
        pausedAt: null,
        pausedForNote: false,
        noteResumeAt: null,
      },
      players: [
        {
          id: "1",
          name: "Jason",
          isNoteGiver: false,
          isHost: true,
          score: 0,
          isDisconnected: false,
        },
        {
          id: "2",
          name: "Writer",
          isNoteGiver: false,
          isHost: false,
          score: 0,
          isDisconnected: false,
        },
        {
          id: "9",
          name: "NoteGiver",
          isNoteGiver: true,
          isHost: false,
          score: 0,
          isDisconnected: false,
        },
      ],
      movies: [
        {
          playerId: "2",
          chosenCard: { id: "c1", type: "plot", text: "Plot A" },
          randomCard: { id: "r1", type: "character", text: "Char A" },
          notesPlayed: [],
          revealed: true,
        },
        {
          playerId: "9",
          chosenCard: { id: "c2", type: "plot", text: "Plot B" },
          randomCard: { id: "r2", type: "character", text: "Char B" },
          notesPlayed: [],
          revealed: true,
        },
      ],
    });
    renderGame();
    expect(screen.getByText(/vote for the best movie/i)).toBeTruthy();
    const voteButtons = screen.getAllByText("Vote");
    expect(voteButtons.length).toBe(2);
  });

  it("calls castVote when vote button clicked", () => {
    setState({
      phase: "round-end",
      round: { current: 1 },
      totalRounds: 3,
      noteGiverId: "9",
      myPlayerId: "1",
      votingActive: true,
      voteCounts: [],
      myVote: null,
      timer: {
        running: true,
        secondsRemaining: 15,
        pausedAt: null,
        pausedForNote: false,
        noteResumeAt: null,
      },
      players: [
        {
          id: "1",
          name: "Jason",
          isNoteGiver: false,
          isHost: true,
          score: 0,
          isDisconnected: false,
        },
        {
          id: "2",
          name: "Writer",
          isNoteGiver: false,
          isHost: false,
          score: 0,
          isDisconnected: false,
        },
      ],
      movies: [
        {
          playerId: "2",
          chosenCard: { id: "c1", type: "plot", text: "Plot A" },
          randomCard: { id: "r1", type: "character", text: "Char A" },
          notesPlayed: [],
          revealed: true,
        },
      ],
    });
    renderGame();
    fireEvent.click(screen.getByText("Vote"));
    expect(mockFns.castVote).toHaveBeenCalledWith("2");
  });

  it("renders game-end with scoreboard and play again for host", () => {
    setState({
      phase: "game-end",
      round: { current: 3 },
      totalRounds: 3,
      myPlayerId: "1",
      players: [
        {
          id: "1",
          name: "Jason",
          isNoteGiver: false,
          isHost: true,
          score: 5,
          isDisconnected: false,
        },
        { id: "2", name: "Bob", isNoteGiver: true, isHost: false, score: 3, isDisconnected: false },
      ],
    });
    renderGame();
    expect(screen.getByText(/wins/i)).toBeTruthy();
    expect(screen.getByText("Scoreboard")).toBeTruthy();
    expect(screen.getByText(/play again/i)).toBeTruthy();
  });
});
