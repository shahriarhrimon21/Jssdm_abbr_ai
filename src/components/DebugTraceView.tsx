import type { DebugTrace } from "../jssdm/debug.ts";

/** Shown only when the app's Debug Mode toggle is on. One collapsible trace
 *  per resolved token, in the numbered step format described in the deep
 *  audit: what was looked up, what mechanism answered, and why. */
export default function DebugTraceView({ trace }: { trace: DebugTrace }) {
  return (
    <details className="debug-trace">
      <summary>▸ debug trace: "{trace.input}" ({trace.direction})</summary>
      {trace.steps.map((s) => (
        <div className="debug-step" key={s.step}>
          <span className="n">{s.step}.</span>
          <span className="lbl">{s.label}</span> — {s.detail}
        </div>
      ))}
      {trace.result ? (
        <div className="debug-step">
          <span className="n">→</span>
          <span className="lbl">RESULT</span>: "{trace.result.text}" (status: {trace.result.status})
        </div>
      ) : (
        <div className="debug-step">
          <span className="n">→</span>
          <span className="lbl">RESULT</span>: unresolved — reported as unverified, not guessed
        </div>
      )}
    </details>
  );
}
