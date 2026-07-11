import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Game } from "../src/pages/Game.js";
import type { PublicRoomState } from "@pitch-storm/shared";

vi.mock("../src/socket.js", () => ({
  socket: { connect: vi.fn(), emit: vi.fn(), on: vi.fn(), off: vi.fn() },
}));

const mockFns = {
  joinRoom: vi.fn(),
  startGame: vi.fn(),
  selectDeckType: vi.fn(),
  selectCard: vi.fn(),
  drawRandomCard: vi.fn(),
  revealMovie: vi.fn(),
  startTimer: vi.fn(),
  pauseTimer: vi.fn(),
  playNote: vi.fn(),
  endPitch: vi.fn(),
  selectWinner: vi.fn(),
  playAgain: vi.fn(),
};

const baseState: PublicRoomState = {
  code: "ABCD",
  phase: "lobby",
  players: [{ id: "1", name: "Jason", isExecutive: false, isHost: true, score: 0, isDisconnected: false }],
  executiveId: null,
  currentPitcherId: null,
  timer: { running: false, secondsRemaining: 45, pausedAt: null },
  round: { current: 0, total: 0 },
  movies: [],
  myPlayerId: "1",
  myHand: null,
  myChosenCard: null,
  myExecutiveNotes: null,
};

let mockState: PublicRoomState = { ...baseState };
vi.mock("../src/hooks/useRoom.js", () => ({
  useRoom: () => ({ roomState: mockState, error: null, ...mockFns }),
}));

function setState(overrides: Partial<PublicRoomState>) {
  mockState = { ...baseState, ...overrides };
}

function renderGame() {
  return render(<MemoryRouter><Game /></MemoryRouter>);
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
      players: [{ id: "2", name: "Bob", isExecutive: false, isHost: false, score: 0, isDisconnected: false }],
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
      round: { current: 1, total: 3 },
      executiveId: "9",
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
      round: { current: 1, total: 3 },
      executiveId: "9",
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
      round: { current: 1, total: 3 },
      executiveId: "9",
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

  it("renders blind draw controls after selecting a card", () => {
    setState({
      phase: "card-selection",
      round: { current: 1, total: 3 },
      executiveId: "9",
      myPlayerId: "1",
      myHand: [{ id: "c1", type: "plot", text: "Plot A" }],
      myChosenCard: { id: "c2", type: "plot", text: "Plot B" },
    });
    renderGame();
    expect(screen.getByText(/draw a blind card/i)).toBeTruthy();
    expect(screen.getByText("Character Deck")).toBeTruthy();
  });

  it("renders executive waiting view during setup when player is executive", () => {
    setState({
      phase: "setup",
      round: { current: 1, total: 3 },
      executiveId: "1",
      myPlayerId: "1",
    });
    renderGame();
    expect(screen.getByText(/you are the executive/i)).toBeTruthy();
  });

  it("renders pitching phase with timer and movie reveal", () => {
    setState({
      phase: "pitching",
      round: { current: 1, total: 3 },
      executiveId: "9",
      myPlayerId: "1",
      currentPitcherId: "1",
      timer: { running: true, secondsRemaining: 45, pausedAt: null },
      movies: [{
        playerId: "1",
        chosenCard: { id: "c1", type: "plot", text: "Plot A" },
        randomCard: { id: "r1", type: "character", text: "Char A" },
        notesPlayed: [],
        revealed: true,
      }],
    });
    renderGame();
    expect(screen.getByText("YOUR TURN TO PITCH!")).toBeTruthy();
    expect(screen.getByText(/i'm done pitching/i)).toBeTruthy();
  });

  it("renders pitching phase from audience perspective with pitcher name", () => {
    setState({
      phase: "pitching",
      round: { current: 1, total: 3 },
      executiveId: "9",
      myPlayerId: "2",
      currentPitcherId: "1",
      players: [
        { id: "1", name: "Jason", isExecutive: false, isHost: true, score: 0, isDisconnected: false },
        { id: "2", name: "Bob", isExecutive: false, isHost: false, score: 0, isDisconnected: false },
        { id: "9", name: "Exec", isExecutive: true, isHost: false, score: 0, isDisconnected: false },
      ],
      timer: { running: true, secondsRemaining: 45, pausedAt: null },
      movies: [{
        playerId: "1",
        chosenCard: { id: "c1", type: "plot", text: "Plot A" },
        randomCard: { id: "r1", type: "character", text: "Char A" },
        notesPlayed: [],
        revealed: true,
      }],
    });
    renderGame();
    expect(screen.getByText(/jason is pitching/i)).toBeTruthy();
  });

  it("renders executive controls for executive during pitching", () => {
    setState({
      phase: "pitching",
      round: { current: 1, total: 3 },
      executiveId: "1",
      myPlayerId: "1",
      currentPitcherId: "2",
      players: [
        { id: "1", name: "Exec", isExecutive: true, isHost: false, score: 0, isDisconnected: false },
        { id: "2", name: "Writer", isExecutive: false, isHost: true, score: 0, isDisconnected: false },
      ],
      timer: { running: false, secondsRemaining: 45, pausedAt: null },
      movies: [{
        playerId: "2",
        chosenCard: { id: "c1", type: "plot", text: "Plot A" },
        randomCard: { id: "r1", type: "character", text: "Char A" },
        notesPlayed: [],
        revealed: true,
      }],
      myExecutiveNotes: [{ id: "n1", type: "note", text: "Note A" }],
    });
    renderGame();
    expect(screen.getByText("Your NOTE Cards")).toBeTruthy();
    expect(screen.getByText("Start Timer")).toBeTruthy();
    expect(screen.getByText("End Pitch")).toBeTruthy();
  });

  it("calls startTimer when start timer button clicked", () => {
    setState({
      phase: "pitching",
      round: { current: 1, total: 3 },
      executiveId: "1",
      myPlayerId: "1",
      currentPitcherId: "2",
      players: [
        { id: "1", name: "Exec", isExecutive: true, isHost: false, score: 0, isDisconnected: false },
        { id: "2", name: "Writer", isExecutive: false, isHost: true, score: 0, isDisconnected: false },
      ],
      timer: { running: false, secondsRemaining: 45, pausedAt: null },
      movies: [{
        playerId: "2",
        chosenCard: { id: "c1", type: "plot", text: "Plot A" },
        randomCard: { id: "r1", type: "character", text: "Char A" },
        notesPlayed: [],
        revealed: true,
      }],
      myExecutiveNotes: [{ id: "n1", type: "note", text: "Note A" }],
    });
    renderGame();
    fireEvent.click(screen.getByText("Start Timer"));
    expect(mockFns.startTimer).toHaveBeenCalled();
  });

  it("renders round-end with pick buttons for executive", () => {
    setState({
      phase: "round-end",
      round: { current: 1, total: 3 },
      executiveId: "1",
      myPlayerId: "1",
      players: [
        { id: "1", name: "Exec", isExecutive: true, isHost: false, score: 0, isDisconnected: false },
        { id: "2", name: "Writer", isExecutive: false, isHost: true, score: 0, isDisconnected: false },
      ],
      movies: [{
        playerId: "2",
        chosenCard: { id: "c1", type: "plot", text: "Plot A" },
        randomCard: { id: "r1", type: "character", text: "Char A" },
        notesPlayed: [],
        revealed: true,
      }],
    });
    renderGame();
    expect(screen.getByText(/select the best movie/i)).toBeTruthy();
    expect(screen.getByText("Pick This Movie")).toBeTruthy();
  });

  it("calls selectWinner when pick button clicked", () => {
    setState({
      phase: "round-end",
      round: { current: 1, total: 3 },
      executiveId: "1",
      myPlayerId: "1",
      players: [
        { id: "1", name: "Exec", isExecutive: true, isHost: false, score: 0, isDisconnected: false },
        { id: "2", name: "Writer", isExecutive: false, isHost: true, score: 0, isDisconnected: false },
      ],
      movies: [{
        playerId: "2",
        chosenCard: { id: "c1", type: "plot", text: "Plot A" },
        randomCard: { id: "r1", type: "character", text: "Char A" },
        notesPlayed: [],
        revealed: true,
      }],
    });
    renderGame();
    fireEvent.click(screen.getByText("Pick This Movie"));
    expect(mockFns.selectWinner).toHaveBeenCalledWith("2");
  });

  it("renders game-end with scoreboard and play again for host", () => {
    setState({
      phase: "game-end",
      round: { current: 3, total: 3 },
      myPlayerId: "1",
      players: [
        { id: "1", name: "Jason", isExecutive: false, isHost: true, score: 5, isDisconnected: false },
        { id: "2", name: "Bob", isExecutive: true, isHost: false, score: 3, isDisconnected: false },
      ],
    });
    renderGame();
    expect(screen.getByText(/game over/i)).toBeTruthy();
    expect(screen.getByText("Scoreboard")).toBeTruthy();
    expect(screen.getByText(/play again/i)).toBeTruthy();
  });
});