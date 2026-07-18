import { useState, useEffect, useCallback } from "react";
import { socket } from "../socket.js";
import type {
  PublicRoomState,
  AudienceRoomState,
  Movie,
  Card,
  DeckType,
} from "@direct-to-video/shared";

export function useRoom() {
  const [roomState, setRoomState] = useState<PublicRoomState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!socket.connected) socket.connect();

    socket.on("room_joined", (state: PublicRoomState) => {
      setRoomState(state);
    });

    socket.on("player_list_updated", (players) => {
      setRoomState((prev) => (prev ? { ...prev, players } : prev));
    });

    socket.on("movie_revealed", (movie: Movie) => {
      setRoomState((prev) =>
        prev
          ? {
              ...prev,
              movies: [...prev.movies.filter((m) => m.playerId !== movie.playerId), movie],
            }
          : prev,
      );
    });

    socket.on("timer_started", (secondsRemaining: number) => {
      setRoomState((prev) =>
        prev
          ? {
              ...prev,
              timer: {
                running: true,
                secondsRemaining,
                pausedAt: null,
                pausedForNote: false,
                noteResumeAt: null,
              },
            }
          : prev,
      );
    });

    socket.on("timer_tick", (secondsRemaining: number) => {
      setRoomState((prev) =>
        prev
          ? {
              ...prev,
              timer: {
                ...prev.timer,
                running: true,
                secondsRemaining,
                pausedAt: null,
                pausedForNote: false,
                noteResumeAt: null,
              },
            }
          : prev,
      );
    });

    socket.on("timer_paused", (remainingSeconds: number) => {
      setRoomState((prev) =>
        prev
          ? {
              ...prev,
              timer: {
                ...prev.timer,
                running: false,
                secondsRemaining: remainingSeconds,
                pausedAt: Date.now(),
                pausedForNote: false,
                noteResumeAt: null,
              },
            }
          : prev,
      );
    });

    socket.on("timer_expired", () => {
      setRoomState((prev) =>
        prev
          ? {
              ...prev,
              timer: {
                running: false,
                secondsRemaining: 0,
                pausedAt: null,
                pausedForNote: false,
                noteResumeAt: null,
              },
            }
          : prev,
      );
    });

    socket.on("note_played", (noteCard: Card, playerId: string) => {
      setRoomState((prev) =>
        prev
          ? {
              ...prev,
              movies: prev.movies.map((m) =>
                m.playerId === playerId ? { ...m, notesPlayed: [...m.notesPlayed, noteCard] } : m,
              ),
            }
          : prev,
      );
    });

    socket.on("pitch_ended", (__playerId: string) => {});

    socket.on("next_pitcher", (playerId: string) => {
      setRoomState((prev) => (prev ? { ...prev, currentPitcherId: playerId } : prev));
    });

    socket.on("voting_started", (secondsRemaining: number) => {
      setRoomState((prev) =>
        prev
          ? {
              ...prev,
              votingActive: true,
              timer: {
                running: true,
                secondsRemaining,
                pausedAt: null,
                pausedForNote: false,
                noteResumeAt: null,
              },
            }
          : prev,
      );
    });

    socket.on("vote_update", (voteCounts: { playerId: string; votes: number }[]) => {
      setRoomState((prev) => (prev ? { ...prev, voteCounts } : prev));
    });

    socket.on("voting_ended", (roundWinnerId: string | null) => {
      setRoomState((prev) => (prev ? { ...prev, votingActive: false, roundWinnerId } : prev));
    });

    socket.on("round_started", (roundNumber: number) => {
      setRoomState((prev) =>
        prev ? { ...prev, round: { ...prev.round, current: roundNumber } } : prev,
      );
    });

    socket.on("game_ended", (__scoreboard) => {
      setRoomState((prev) => (prev ? { ...prev, phase: "game-end" } : prev));
    });

    socket.on("error", (msg: string) => {
      setError(msg);
    });

    socket.on("kicked", () => {
      setError("You have been removed from the room");
    });

    return () => {
      socket.off("room_joined");
      socket.off("player_list_updated");
      socket.off("movie_revealed");
      socket.off("timer_started");
      socket.off("timer_tick");
      socket.off("timer_paused");
      socket.off("timer_expired");
      socket.off("note_played");
      socket.off("pitch_ended");
      socket.off("next_pitcher");
      socket.off("voting_started");
      socket.off("vote_update");
      socket.off("voting_ended");
      socket.off("round_started");
      socket.off("game_ended");
      socket.off("error");
      socket.off("kicked");
    };
  }, []);

  const joinRoom = useCallback((code: string, name: string) => {
    socket.emit("join_room", code, name);
  }, []);

  const joinAudience = useCallback((code: string) => {
    socket.emit("join_audience", code);
  }, []);

  const startGame = useCallback(() => {
    socket.emit("start_game");
  }, []);
  const selectDeckType = useCallback((dt: DeckType) => {
    socket.emit("select_deck_type", dt);
  }, []);
  const selectCard = useCallback((cardId: string) => {
    socket.emit("select_card", cardId);
  }, []);
  const revealMovie = useCallback(() => {
    socket.emit("reveal_movie");
  }, []);
  const startTimer = useCallback(() => {
    socket.emit("start_timer");
  }, []);
  const pauseTimer = useCallback(() => {
    socket.emit("pause_timer");
  }, []);
  const playNote = useCallback((noteCardId: string) => {
    socket.emit("play_note", noteCardId);
  }, []);
  const endPitch = useCallback(() => {
    socket.emit("end_pitch");
  }, []);
  const castVote = useCallback((playerId: string) => {
    socket.emit("cast_vote", playerId);
  }, []);
  const playAgain = useCallback(() => {
    socket.emit("play_again");
  }, []);
  const setFranchiseEnabled = useCallback((enabled: boolean) => {
    socket.emit("set_franchise_enabled", enabled);
  }, []);
  const setTotalRounds = useCallback((rounds: number) => {
    socket.emit("set_total_rounds", rounds);
  }, []);
  const kickPlayer = useCallback((playerId: string) => {
    socket.emit("kick_player", playerId);
  }, []);

  const leaveGame = useCallback(() => {
    socket.disconnect();
    setRoomState(null);
    setError(null);
  }, []);

  return {
    roomState,
    error,
    joinRoom,
    joinAudience,
    startGame,
    selectDeckType,
    selectCard,
    revealMovie,
    startTimer,
    pauseTimer,
    playNote,
    endPitch,
    castVote,
    playAgain,
    setFranchiseEnabled,
    setTotalRounds,
    kickPlayer,
    leaveGame,
  };
}

export function useAudience() {
  const [audienceState, setAudienceState] = useState<AudienceRoomState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!socket.connected) socket.connect();

    socket.on("audience_joined", (state: AudienceRoomState) => {
      setAudienceState(state);
    });

    socket.on("audience_update", (state: AudienceRoomState) => {
      setAudienceState(state);
    });

    socket.on("error", (msg: string) => {
      setError(msg);
    });

    socket.on("movie_revealed", (movie: Movie) => {
      setAudienceState((prev) =>
        prev
          ? {
              ...prev,
              movies: [...prev.movies.filter((m) => m.playerId !== movie.playerId), movie],
            }
          : prev,
      );
    });

    socket.on("timer_started", (secondsRemaining: number) => {
      setAudienceState((prev) =>
        prev
          ? {
              ...prev,
              timer: {
                running: true,
                secondsRemaining,
                pausedAt: null,
                pausedForNote: false,
                noteResumeAt: null,
              },
            }
          : prev,
      );
    });

    socket.on("timer_tick", (secondsRemaining: number) => {
      setAudienceState((prev) =>
        prev
          ? {
              ...prev,
              timer: {
                running: true,
                secondsRemaining,
                pausedAt: null,
                pausedForNote: false,
                noteResumeAt: null,
              },
            }
          : prev,
      );
    });

    socket.on("timer_paused", (remainingSeconds: number) => {
      setAudienceState((prev) =>
        prev
          ? {
              ...prev,
              timer: {
                ...prev.timer,
                running: false,
                secondsRemaining: remainingSeconds,
                pausedAt: Date.now(),
                pausedForNote: false,
                noteResumeAt: null,
              },
            }
          : prev,
      );
    });

    socket.on("timer_expired", () => {
      setAudienceState((prev) =>
        prev
          ? {
              ...prev,
              timer: {
                running: false,
                secondsRemaining: 0,
                pausedAt: null,
                pausedForNote: false,
                noteResumeAt: null,
              },
            }
          : prev,
      );
    });

    socket.on("note_played", (noteCard: Card, playerId: string) => {
      setAudienceState((prev) =>
        prev
          ? {
              ...prev,
              movies: prev.movies.map((m) =>
                m.playerId === playerId ? { ...m, notesPlayed: [...m.notesPlayed, noteCard] } : m,
              ),
            }
          : prev,
      );
    });

    socket.on("voting_started", (secondsRemaining: number) => {
      setAudienceState((prev) =>
        prev
          ? {
              ...prev,
              votingActive: true,
              timer: {
                running: true,
                secondsRemaining,
                pausedAt: null,
                pausedForNote: false,
                noteResumeAt: null,
              },
            }
          : prev,
      );
    });

    socket.on("vote_update", (voteCounts: { playerId: string; votes: number }[]) => {
      setAudienceState((prev) => (prev ? { ...prev, voteCounts } : prev));
    });

    socket.on("voting_ended", (roundWinnerId: string | null) => {
      setAudienceState((prev) => (prev ? { ...prev, votingActive: false, roundWinnerId } : prev));
    });

    socket.on("game_ended", () => {
      setAudienceState((prev) => (prev ? { ...prev, phase: "game-end" } : prev));
    });

    return () => {
      socket.off("audience_joined");
      socket.off("audience_update");
      socket.off("error");
      socket.off("movie_revealed");
      socket.off("timer_started");
      socket.off("timer_tick");
      socket.off("timer_paused");
      socket.off("timer_expired");
      socket.off("note_played");
      socket.off("voting_started");
      socket.off("vote_update");
      socket.off("voting_ended");
      socket.off("game_ended");
    };
  }, []);

  const join = useCallback((code: string) => {
    socket.emit("join_audience", code);
  }, []);
  const castVote = useCallback((playerId: string) => {
    socket.emit("cast_vote", playerId);
  }, []);

  return { audienceState, error, join, castVote };
}
