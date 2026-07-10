import type { ReactNode } from "react";

interface CardTemplateProps {
  type: "plot" | "character" | "note" | "face-down";
  children: ReactNode;
  large?: boolean;
}

export function CardTemplate({ type, children, large = false }: CardTemplateProps) {
  const className = `card-template card--${type}${large ? " card-large" : ""}`;
  return <div className={className}>{children}</div>;
}