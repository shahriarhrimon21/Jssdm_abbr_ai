import { useMemo, useState } from "react";
import { searchAbbrPartial, searchFullPartial } from "../jssdm/search.ts";
import { findRuleSupportedFull } from "../jssdm/ruleEngine.ts";
import { catList, svcList, fmtSource } from "../jssdm/database.ts";
import { addRecent, isFavorite, toggleFavorite } from "../jssdm/favorites.ts";
import Icon from "../components/Icon.tsx";
import type { Entry } from "../jssdm/types.ts";

function dedupe(entries: Entry[]): Entry[] {
  const seen = new Set<number>();
  const out: Entry[] = [];
  entries.forEach((e) => {
    if (!seen.has(e.id)) {
      seen.add(e.id);
      out.push(e);
    }
  });
  return out;
}

export default function Search() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [service, setService] = useState("all");
  // isFavorite() reads localStorage directly rather than being carried in
  // React state (favorites.ts is shared with Favorites.tsx and has no
  // subscription mechanism of its own), so toggling a star has to force a
  // re-render explicitly — the same pattern Favorites.tsx already uses.
  const [, forceRerender] = useState(0);
  const categories = useMemo(() => catList(), []);
  const services = useMemo(() => svcList(), []);
  const filt = { category, service };

  function star(id: number) {
    toggleFavorite(id);
    forceRerender((n) => n + 1);
  }

  const results = useMemo(() => {
    if (!q.trim()) return [];
    const merged = dedupe([...searchAbbrPartial(q, filt), ...searchFullPartial(q, filt)]);
    if (q.trim() && merged.length) addRecent("search", q.trim());
    return merged;
  }, [q, category, service]);

  const ruleSupported = useMemo(() => findRuleSupportedFull(q), [q]);

  return (
    <div>
      <div className="view-head">
        <div>
          <h2>Search / Reverse Lookup</h2>
          <div className="view-sub">Search by abbreviation or full form. Results are ranked so a Section 16 Annex B collision surfaces its more specific candidate first.</div>
        </div>
      </div>

      <div className="panel">
        <div className="field-row">
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="flabel" htmlFor="search-q">
              Search
            </label>
            <input id="search-q" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. pers, Personnel, tk..." />
          </div>
          <div>
            <label className="flabel" htmlFor="search-cat">
              Category
            </label>
            <select id="search-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">All</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="flabel" htmlFor="search-svc">
              Force
            </label>
            <select id="search-svc" value={service} onChange={(e) => setService(e.target.value)}>
              <option value="all">All</option>
              <option value="General">General (not force-specific)</option>
              {services.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {q.trim() && (
        <div className="panel">
          <h3>
            Results <span className="pill">{results.length}</span>
          </h3>
          {results.length === 0 && <div className="empty">No matches found in the uploaded manual for "{q}".</div>}
          {results.length > 0 && (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>Abbreviation</th>
                    <th>Full form</th>
                    <th>Category</th>
                    <th>Force</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((e) => {
                    const fav = isFavorite(e.id);
                    return (
                      <tr key={e.id}>
                        <td>
                          <button
                            className={"star-toggle" + (fav ? " on" : "")}
                            onClick={() => star(e.id)}
                            aria-pressed={fav}
                            aria-label={fav ? `Remove ${e.abbr} from favorites` : `Add ${e.abbr} to favorites`}
                          >
                            <Icon name="saved" size={16} />
                          </button>
                        </td>
                        <td className="cell-abbr">{e.abbr}</td>
                        <td>{e.full}</td>
                        <td>{e.category}</td>
                        <td>{e.service || "General"}</td>
                        <td className="src">{fmtSource(e)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {ruleSupported.length > 0 && (
            <>
              <h3 style={{ marginTop: 16 }}>Not separately listed, but rule-supported</h3>
              {ruleSupported.map((r, i) => (
                <div className="rule-box" key={i}>
                  <span className="rc">{r.entry.abbr}</span>→ {r.entry.full} for "{r.appliedTo}" via {r.viaSuffix}
                  <div className="src" style={{ marginTop: 4 }}>
                    {r.reason}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
