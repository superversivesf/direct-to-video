import type { Card as CardType, DeckType } from "@pitch-storm/shared";
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
}

export function WriterControls({ hand, selectedCard, hasSelectedCard, hasDrawnBlind, blindCard, blindRevealed, onSelectCard, onReady }: WriterControlsProps) {
  const blindDeckType: DeckType = selectedCard?.type === "plot" ? "character" : "plot";

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
                <Card card={blindCard || { id: "blank", type: blindDeckType, text: "" }} faceDown={true} />
              </>
            ) : (
              <>
                <Card card={blindCard || { id: "blank", type: blindDeckType, text: "" }} faceDown={true} />
                <Card card={selectedCard} />
              </>
            )}
          </div>
          <div className="blind-draw-controls">
            <p>Your blind card will be revealed when you start pitching!</p>
          </div>
          <button className="btn-ready" onClick={onReady}>
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
        </>
      )}
    </div>
  );
}