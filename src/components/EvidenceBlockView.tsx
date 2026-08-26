import type { EvidenceBlock } from "../jssdm/validation.ts";
import Icon from "./Icon.tsx";

/**
 * One auditable "which rule was applied, and where does it come from"
 * record from validation.ts.
 *
 * Rebuilt for Phase 2 as a real definition list rather than the previous
 * run of <br>-separated text. That is an accessibility change as much as a
 * visual one: a screen reader now announces "Input: tk / Result: Tank /
 * Reference: 16C-2" as labelled pairs instead of one undifferentiated
 * paragraph, and the citation can be presented as data without
 * italicising a whole block.
 *
 * The block kinds and their wording come from the frozen engine; only
 * their presentation belongs to this phase.
 */
export default function EvidenceBlockView({ block }: { block: EvidenceBlock }) {
  if (block.kind === "cap-issue") {
    return (
      <div className="evidence bad">
        <div className="ev-title">
          <Icon name="warning" size={15} />
          Capitalization issue
        </div>
        <dl>
          <dt>Entered</dt>
          <dd>
            <code>{block.entered}</code>
          </dd>
          <dt>Expected</dt>
          <dd>
            <code>{block.expected}</code>
          </dd>
          <dt>Reason</dt>
          <dd>{block.reason}</dd>
          <dt>Source</dt>
          <dd className="cite-ref">{block.source}</dd>
        </dl>
      </div>
    );
  }

  if (block.kind === "verified") {
    return (
      <div className="evidence ok">
        <div className="ev-title">
          <Icon name="verified" size={15} />
          {block.label}
        </div>
        <dl>
          <dt>Input</dt>
          <dd>
            <code>{block.input}</code>
          </dd>
          {block.result != null && (
            <>
              <dt>Result</dt>
              <dd>
                <code>{block.result}</code>
              </dd>
            </>
          )}
          <dt>Reason</dt>
          <dd>{block.reason}</dd>
          <dt>Reference</dt>
          <dd className="cite-ref">{block.reference}</dd>
        </dl>
      </div>
    );
  }

  return (
    <div className="evidence ok">
      <div className="ev-title">
        <Icon name="success" size={15} />
        Rule-supported
      </div>
      <dl>
        <dt>Input</dt>
        <dd>
          <code>{block.input}</code>
        </dd>
        <dt>Result</dt>
        <dd>
          <code>{block.result}</code>
        </dd>
        <dt>Reason</dt>
        <dd>{block.reason}</dd>
        <dt>Reference</dt>
        <dd className="cite-ref">{block.reference}</dd>
      </dl>
    </div>
  );
}
