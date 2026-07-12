import type { Phase } from "@pitch-storm/shared";

interface PhaseIndicatorProps {
  phase: Phase;
  isExecutive: boolean;
}

export function PhaseIndicator({ phase, isExecutive }: PhaseIndicatorProps) {
  const steps = isExecutive
    ? [
        { key: "setup", label: "Setup" },
        { key: "card-selection", label: "Writers Prep" },
        { key: "pitching", label: "Pitching" },
        { key: "round-end", label: "Pick Winner" },
      ]
    : [
        { key: "setup", label: "Choose Deck" },
        { key: "card-selection", label: "Build Movie" },
        { key: "pitching", label: "Pitching" },
        { key: "round-end", label: "Results" },
      ];

  const activeIndex = steps.findIndex((s) => s.key === phase);
  if (activeIndex === -1) return null;

  return (
    <div className="phase-indicator">
      {steps.map((step, i) => (
        <div key={step.key} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {i > 0 && <div className="phase-divider" />}
          <div className={`phase-step ${i === activeIndex ? "active" : ""} ${i < activeIndex ? "done" : ""}`}>
            <div className="phase-step-dot" />
            {step.label}
          </div>
        </div>
      ))}
    </div>
  );
}