import type { Card as CardType, DeckType } from "@pitch-storm/shared";
import { Card } from "./Card.js";

interface WriterControlsProps {
  hand: CardType[];
  hasSelectedCard: boolean;
  hasDrawnBlind: boolean;
  onSelectDeckType: (dt: DeckType) => void;
  onSelectCard: (cardId: string) => void;
  onDrawBlind: (dt: DeckType) => void;
  onReady: () => void;
}

export function WriterControls({ hand, hasSelectedCard, hasDrawnBlind, onSelectDeckType, onSelectCard, onDrawBlind, onReady }: WriterControlsProps) {
  return (
    <div className="writer-controls">
      <h3>Your Hand</h3>
      <div className="card-row">
        {hand.map((card) => (
          <Card key={card.id} card={card} onClick={() => onSelectCard(card.id)} />
        ))}
      </div>
      {!hasSelectedCard && hand.length === 3 && (
        <p>Select a card from your hand to play.</p>
      )}
      {hasSelectedCard && !hasDrawnBlind && (
        <div className="blind-draw-controls">
          <p>Draw a blind card from:</p>
          <button onClick={() => onDrawBlind("plot")}>Plot Deck</button>
          <button onClick={() => onDrawBlind("character")}>Character Deck</button>
        </div>
      )}
    </div>
  );
}