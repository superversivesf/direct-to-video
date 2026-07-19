import type { Card as CardType, DeckType, Movie as MovieType } from "@direct-to-video/shared";
import { Card } from "./Card.js";

interface WriterControlsProps {
  hand: CardType[];
  selectedCard: CardType | null;
  hasSelectedCard: boolean;
  hasDrawnBlind: boolean;
  blindCard: CardType | null;
  blindRevealed: boolean;
  onSelectCard: (cardId: string) => void;
  onReady: () => void;
  movieHistory: MovieType[];
  franchiseSourceMovieId: string | null;
  myPlayerId: string;
  onSelectFranchiseSource: (sourceMovieId: string) => void;
}

export function WriterControls({
  hand,
  selectedCard,
  hasSelectedCard,
  hasDrawnBlind: _hasDrawnBlind,
  blindCard,
  blindRevealed,
  onSelectCard,
  onReady,
  movieHistory,
  franchiseSourceMovieId,
  myPlayerId,
  onSelectFranchiseSource,
}: WriterControlsProps) {
  const blindDeckType: DeckType = selectedCard?.type === "plot" ? "character" : "plot";
  const isFranchiseCard = selectedCard?.isFranchise === true;
  const showFranchisePicker = isFranchiseCard && movieHistory.length > 0;
  const franchiseSelectionMissing = showFranchisePicker && !franchiseSourceMovieId;
  const readyDisabled = franchiseSelectionMissing === true;

  const pickableHistory = movieHistory.filter((m) => m.playerId !== myPlayerId);

  const renderFranchisePicker = () => (
    <div className="franchise-picker">
      <h4>Pick a previously pitched movie</h4>
      <ul className="franchise-history-list">
        {pickableHistory.map((m) => (
          <li key={m.id}>
            <button
              className={`franchise-history-item${
                franchiseSourceMovieId === m.id ? " selected" : ""
              }`}
              onClick={() => onSelectFranchiseSource(m.id)}
            >
              <span className="franchise-history-text">{m.chosenCard.text}</span>
              <span className="franchise-history-blind"> + {m.randomCard.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="writer-controls">
      {!hasSelectedCard && (
        <>
          <h3>Your Hand — click a card to play it</h3>
          <div className="card-row">
            {hand.map((card) => (
              <Card key={card.id} card={card} onClick={() => onSelectCard(card.id)} />
            ))}
          </div>
        </>
      )}
      {hasSelectedCard && selectedCard && !blindRevealed && (
        <>
          <h3>Your Movie</h3>
          <div className="movie-cards">
            {selectedCard.type === "character" ? (
              <>
                <Card card={selectedCard} />
                <Card
                  card={blindCard || { id: "blank", type: blindDeckType, text: "" }}
                  faceDown={true}
                />
              </>
            ) : (
              <>
                <Card
                  card={blindCard || { id: "blank", type: blindDeckType, text: "" }}
                  faceDown={true}
                />
                <Card card={selectedCard} />
              </>
            )}
          </div>
          <div className="blind-draw-controls">
            <p>Your blind card will be revealed when you start pitching!</p>
          </div>
          {showFranchisePicker && renderFranchisePicker()}
          <button className="btn-ready" onClick={onReady} disabled={readyDisabled}>
            Ready to Pitch
          </button>
        </>
      )}
      {hasSelectedCard && selectedCard && blindRevealed && blindCard && (
        <>
          <h3>Your Movie</h3>
          <div className="movie-cards">
            {selectedCard.type === "character" ? (
              <>
                <Card card={selectedCard} />
                <Card card={blindCard} />
              </>
            ) : (
              <>
                <Card card={blindCard} />
                <Card card={selectedCard} />
              </>
            )}
          </div>
          {showFranchisePicker && renderFranchisePicker()}
          <button className="btn-ready" onClick={onReady} disabled={readyDisabled}>
            Ready to Pitch
          </button>
        </>
      )}
    </div>
  );
}