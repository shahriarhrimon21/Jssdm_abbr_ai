import type { EvidenceBlock } from "../jssdm/validation.ts";

/** Renders the structured evidence blocks from validation.ts — the same
 *  "which rule was applied" auditable format the original app rendered as
 *  raw HTML strings (capIssueBlock/verifiedBlock/ruleSupportedBlock),
 *  reproduced here as real elements. */
export default function EvidenceBlockView({ block }: { block: EvidenceBlock }) {
  if (block.kind === "cap-issue") {
    return (
      <div className="result-block bad cap-issue">
        <strong>⚠ Capitalization issue</strong>
        <br />
        Entered: <code>{block.entered}</code>
        <br />
        Expected: <code>{block.expected}</code>
        <br />
        Reason: {block.reason}
        <br />
        Source: {block.source}
      </div>
    );
  }
  if (block.kind === "verified") {
    return (
      <div className="result-block ok cap-issue">
        <strong>✓ {block.label}</strong>
        <br />
        Input: <code>{block.input}</code>
        <br />
        {block.result != null && (
          <>
            Result: <code>{block.result}</code>
            <br />
          </>
        )}
        Reason: {block.reason}
        <br />
        Reference: {block.reference}
      </div>
    );
  }
  return (
    <div className="result-block rule cap-issue">
      <strong>✓ Rule-supported</strong>
      <br />
      Input: <code>{block.input}</code>
      <br />
      Result: <code>{block.result}</code>
      <br />
      Reason: {block.reason}
      <br />
      Reference: {block.reference}
    </div>
  );
}
