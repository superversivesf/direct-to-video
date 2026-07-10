import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Join } from "../src/pages/Join.js";

vi.mock("../src/socket.js", () => ({
  socket: { connect: vi.fn(), emit: vi.fn(), on: vi.fn(), off: vi.fn() },
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

beforeEach(() => {
  mockNavigate.mockClear();
});

describe("Join", () => {
  it("renders room code input", () => {
    render(<MemoryRouter><Join /></MemoryRouter>);
    expect(screen.getByPlaceholderText(/room code/i)).toBeTruthy();
  });

  it("renders name input", () => {
    render(<MemoryRouter><Join /></MemoryRouter>);
    expect(screen.getByPlaceholderText(/your name/i)).toBeTruthy();
  });

  it("renders join as player button", () => {
    render(<MemoryRouter><Join /></MemoryRouter>);
    expect(screen.getByText(/join as player/i)).toBeTruthy();
  });

  it("renders join as audience button", () => {
    render(<MemoryRouter><Join /></MemoryRouter>);
    expect(screen.getByText(/join as audience/i)).toBeTruthy();
  });

  it("navigates to /room/:code when joining as player", () => {
    render(<MemoryRouter><Join /></MemoryRouter>);
    const codeInput = screen.getByPlaceholderText(/room code/i);
    const nameInput = screen.getByPlaceholderText(/your name/i);
    fireEvent.change(codeInput, { target: { value: "ABCD" } });
    fireEvent.change(nameInput, { target: { value: "Jason" } });
    fireEvent.click(screen.getByText(/join as player/i));
    expect(mockNavigate).toHaveBeenCalledWith("/room/ABCD");
  });
});