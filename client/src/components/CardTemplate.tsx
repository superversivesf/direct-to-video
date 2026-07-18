import type { ReactNode } from "react";

interface CardTemplateProps {
  type: "plot" | "character" | "note" | "face-down";
  children: ReactNode;
  large?: boolean;
  onClick?: () => void;
}

export function CardTemplate({ type, children, large = false, onClick }: CardTemplateProps) {
  const className = `card-template card--${type}${large ? " card-large" : ""}`;
  return (
    <div
      className={className}
      onClick={onClick}
      style={onClick ? { cursor: "pointer" } : undefined}
    >
      {children}
    </div>
  );
}
