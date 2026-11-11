import type { CurrentStageSummary } from "@/lib/position/current-stage-summary";

export function StageSummary({
  summary,
}: {
  summary?: CurrentStageSummary;
}) {
  if (!summary) return null;

  return (
    <div
      aria-label="Current application counts"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        marginTop: 6,
      }}
    >
      {summary.stages.map((stage) => (
        <span
          key={stage.stageMappingId}
          title={`Currently in ${stage.label}: ${stage.current}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "3px 7px",
            fontSize: 12,
            color: "var(--fg-2)",
          }}
        >
          <span>{stage.label}</span>
          <strong className="sh-num">{stage.current}</strong>
        </span>
      ))}

      {summary.stopped > 0 && (
        <span className="shx-small" style={{ alignSelf: "center" }}>
          Ended / rejected / withdrawn: {summary.stopped}
        </span>
      )}

      {summary.unassigned > 0 && (
        <span className="shx-small" style={{ alignSelf: "center" }}>
          Unassigned: {summary.unassigned}
        </span>
      )}
    </div>
  );
}
