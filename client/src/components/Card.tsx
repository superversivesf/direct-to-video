import type { Card as CardType } from "@direct-to-video/shared";
import { CardTemplate } from "./CardTemplate.js";

interface CardProps {
  card: CardType;
  faceDown?: boolean;
  large?: boolean;
  onClick?: () => void;
}

export function Card({ card, faceDown = false, large = false, onClick }: CardProps) {
  if (faceDown) {
    return (
      <CardTemplate type="face-down" large={large} onClick={onClick}>
        <div className="card-back-label">{card.type.toUpperCase()}</div>
      </CardTemplate>
    );
  }

  const displayText = card.substitutedText || card.text;
  const isFranchise = card.isFranchise;
  const isNote = card.type === "note";
  const paragraphs = isNote ? displayText.split(" / ") : [displayText];

  return (
    <CardTemplate type={card.type} large={large} onClick={onClick}>
      <div className="card-type-label">{card.type.toUpperCase()}</div>
      {isFranchise && card.header && <div className="card-header-franchise">{card.header}</div>}
      {!isFranchise && card.header && <div className="card-location">{card.header}</div>}
      <div className="card-text">
        {isNote ? (
          paragraphs.map((p, i) => (
            <p key={i} className="card-note-paragraph">{p}</p>
          ))
        ) : (
          displayText
        )}
      </div>
    </CardTemplate>
  );
}
