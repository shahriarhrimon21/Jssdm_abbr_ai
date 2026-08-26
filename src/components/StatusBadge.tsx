import Icon, { type IconName } from "./Icon.tsx";

export type BadgeStatus = "ok" | "context" | "warn" | "unverified" | "bad" | "rule" | string;

/**
 * The verification status of one substitution, rendered as icon + word.
 *
 * Status is never communicated by colour alone (Phase 2 accessibility
 * rule): each state carries a distinct icon shape AND its own wording, so
 * the badge still reads correctly in greyscale, at low contrast, or to a
 * screen reader. The previous version used bare emoji glyphs (✓ ⚠ ✗),
 * which render inconsistently across platforms and are announced
 * unpredictably; these are real icons from the app's own set.
 *
 * The status vocabulary itself comes from the frozen engine and is not
 * changed here — only its presentation.
 */
const LABELS: Record<string, string> = {
  ok: "Explicitly listed",
  context: "Context-dependent",
  warn: "Check force",
  unverified: "Not found",
  bad: "Not found",
  rule: "Rule-supported",
};
const CLASS: Record<string, string> = {
  ok: "badge-ok",
  context: "badge-warn",
  warn: "badge-warn",
  unverified: "badge-bad",
  bad: "badge-bad",
  rule: "badge-rule",
};
const ICONS: Record<string, IconName> = {
  ok: "verified",
  context: "warning",
  warn: "warning",
  unverified: "unverified",
  bad: "unverified",
  rule: "success",
};

export default function StatusBadge({ status }: { status: BadgeStatus }) {
  const cls = CLASS[status] || "badge-neutral";
  const label = LABELS[status] || status;
  const icon = ICONS[status] || "info";
  return (
    <span className={`badge ${cls}`}>
      <Icon name={icon} size={13} />
      {label}
    </span>
  );
}
