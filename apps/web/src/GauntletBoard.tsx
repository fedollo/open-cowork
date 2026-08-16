import {
  GAUNTLET_BAR_STATUS_LABELS,
  parseGauntletProgress,
  type GauntletPhase,
} from "@open-loop/shared";
import { renderGauntletMarkdown } from "./gauntlet-progress";

const PHASES: GauntletPhase[] = ["lead", "build", "critique", "integrate"];

interface GauntletBoardProps {
  progress: string | null;
  progressPath: string | null;
  phase: GauntletPhase | null;
}

function StructuredList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="gauntlet-structured-section">
      <h3>{title}</h3>
      <ul>
        {items.map((item, i) => (
          <li key={`${title}-${i}`}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export function GauntletBoard({ progress, progressPath, phase }: GauntletBoardProps) {
  const structured = progress ? parseGauntletProgress(progress) : null;
  const activePhaseIndex = phase ? PHASES.indexOf(phase) : -1;

  return (
    <div className="gauntlet-board">
      <div className="gauntlet-board-header">
        <div
          className="gauntlet-phase-timeline"
          role="list"
          aria-label="Gauntlet phases"
        >
          {PHASES.map((step, index) => (
            <span
              key={step}
              role="listitem"
              className={`gauntlet-phase-step${
                phase === step ? " active" : ""
              }${activePhaseIndex > index ? " done" : ""}`}
            >
              {step}
            </span>
          ))}
        </div>
        {structured && (
          <span className={`gauntlet-bar-status ${structured.barStatus}`}>
            {GAUNTLET_BAR_STATUS_LABELS[structured.barStatus]}
          </span>
        )}
      </div>

      {progressPath && (
        <div className="gauntlet-board-meta">{progressPath}</div>
      )}

      {structured &&
        (structured.pieces.length > 0 ||
          structured.verdicts.length > 0 ||
          structured.gaps.length > 0 ||
          structured.nextSteps.length > 0 ||
          structured.rounds.length > 0) && (
          <div className="gauntlet-structured">
            <StructuredList title="Pieces" items={structured.pieces} />
            <StructuredList title="Critic verdicts" items={structured.verdicts} />
            <StructuredList title="Gaps" items={structured.gaps} />
            <StructuredList title="Next steps" items={structured.nextSteps} />
            <StructuredList title="Rounds" items={structured.rounds} />
          </div>
        )}

      {progress ? (
        <details className="gauntlet-raw-details">
          <summary>Raw progress markdown</summary>
          <div
            className="gauntlet-board-content"
            dangerouslySetInnerHTML={{
              __html: renderGauntletMarkdown(progress),
            }}
          />
        </details>
      ) : (
        <div className="gauntlet-board-empty">
          No progress file yet. The agent writes{" "}
          <code>.open-loop/gauntlet-progress.md</code> during a Gauntlet run.
          {phase && (
            <>
              {" "}
              Current phase: <strong>{phase}</strong>
            </>
          )}
        </div>
      )}
    </div>
  );
}
