import type { Card as CardType, DeckType } from "@pitch-storm/shared";
import { Card } from "./Card.js";

interface WriterControlsProps {
  hand: CardType[];
  selectedCard: CardType | null;
  hasSelectedCard: boolean;
  hasDrawnBlind: boolean;
  onSelectCard: (cardId: string) => void;
  onDrawBlind: (dt: DeckType) => void;
  onReady: () => void;
}

export function WriterControls({ hand, selectedCard, hasSelectedCard, hasDrawnBlind, onSelectCard, onDrawBlind, onReady }: WriterControlsProps) {
  const blindDeckType: DeckType = selectedCard?.type === "plot" ? "character" : "plot";
  const blindDeckLabel = blindDeckType === "plot" ? "Plot" : "Character";

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
      {hasSelectedCard && selectedCard && !hasDrawnBlind && (
        <>
          <h3>Card Selected</h3>
          <div className="card-row">
            <Card card={selectedCard} />
          </div>
          <div className="blind-draw-controls">
            <p>Draw a blind card from the {blindDeckLabel} deck:</p>
            <button className="btn-draw" onClick={() => onDrawBlind(blindDeckType)}>{blindDeckLabel} Deck</button>
          </div>
        </>
      )}
      {hasSelectedCard && hasDrawnBlind && (
        <div className="ready-section">
          <p>Your movie is ready! Click when you're ready to pitch.</p>
          <button className="btn-ready" onClick={onReady}>
            Ready to Pitch
          </button>
        </div>
      )}
    </div>
  );
}