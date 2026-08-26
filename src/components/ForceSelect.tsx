const FORCES = ["all", "Army", "Navy", "Air Force", "Joint"];

/**
 * Service selection. Force changes which entries the engine prefers, so
 * it is presented as a genuine setting rather than a filter chip — and it
 * now lives globally in the top bar (Phase 2 §12) instead of being
 * repeated on each of the six pages it affects.
 *
 * `inline` renders the compact top-bar form; the default keeps the
 * stacked label used inside page forms.
 */
export default function ForceSelect({
  value,
  onChange,
  inline = false,
}: {
  value: string;
  onChange: (v: string) => void;
  inline?: boolean;
}) {
  return (
    <>
      <label className="flabel" htmlFor="force-select">
        Force
      </label>
      <select id="force-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {FORCES.map((f) => (
          <option key={f} value={f}>
            {f === "all" ? (inline ? "All forces" : "All / not specified") : f}
          </option>
        ))}
      </select>
    </>
  );
}
