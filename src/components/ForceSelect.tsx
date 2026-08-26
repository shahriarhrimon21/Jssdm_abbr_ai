const FORCES = ["all", "Army", "Navy", "Air Force", "Joint"];

export default function ForceSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="flabel" htmlFor="force-select">
        Force
      </label>
      <select id="force-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {FORCES.map((f) => (
          <option key={f} value={f}>
            {f === "all" ? "All / not specified" : f}
          </option>
        ))}
      </select>
    </div>
  );
}
