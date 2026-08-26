export type BadgeStatus = "ok" | "context" | "warn" | "unverified" | "bad" | "rule" | string;

const LABELS: Record<string, string> = {
  ok: "✓ Explicitly listed",
  context: "⚠ Context-dependent",
  warn: "⚠ Check force",
  unverified: "✗ Not found",
  bad: "✗ Not found",
  rule: "✓ Rule-supported",
};
const CLASS: Record<string, string> = {
  ok: "badge-ok",
  context: "badge-warn",
  warn: "badge-warn",
  unverified: "badge-bad",
  bad: "badge-bad",
  rule: "badge-rule",
};

export default function StatusBadge({ status }: { status: BadgeStatus }) {
  const cls = CLASS[status] || "badge-neutral";
  const label = LABELS[status] || status;
  return <span className={`badge ${cls}`}>{label}</span>;
}
