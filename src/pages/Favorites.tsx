import { useState } from "react";
import { getFavorites, getRecent, toggleFavorite, clearFavorites, clearRecent } from "../jssdm/favorites.ts";
import { ENTRIES, fmtSource } from "../jssdm/database.ts";

export default function Favorites() {
  const [, forceRerender] = useState(0);
  const favIds = getFavorites();
  const favs = ENTRIES.filter((e) => favIds.includes(e.id));
  const recent = getRecent();

  function refresh() {
    forceRerender((n) => n + 1);
  }

  return (
    <div>
      <div className="view-head">
        <div>
          <h2>Favorites &amp; Recent</h2>
          <div className="view-sub">Stored only in your browser (localStorage) — never sent anywhere, and never changes the underlying JSSDM data.</div>
        </div>
      </div>

      <div className="panel">
        <h3>
          Favorites <span className="pill">{favs.length}</span>
        </h3>
        {favs.length === 0 && <div className="empty">No favorites yet. Star an entry from Search to add it here.</div>}
        {favs.length > 0 && (
          <>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Abbreviation</th>
                    <th>Full form</th>
                    <th>Source</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {favs.map((e) => (
                    <tr key={e.id}>
                      <td className="cell-abbr">{e.abbr}</td>
                      <td>{e.full}</td>
                      <td className="src">{fmtSource(e)}</td>
                      <td>
                        <button
                          className="btn secondary small"
                          onClick={() => {
                            toggleFavorite(e.id);
                            refresh();
                          }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="btnrow" style={{ marginTop: 10 }}>
              <button
                className="btn secondary small"
                onClick={() => {
                  clearFavorites();
                  refresh();
                }}
              >
                Clear all favorites
              </button>
            </div>
          </>
        )}
      </div>

      <div className="panel">
        <h3>
          Recent lookups <span className="pill">{recent.length}</span>
        </h3>
        {recent.length === 0 && <div className="empty">No recent lookups yet.</div>}
        {recent.length > 0 && (
          <>
            <div className="chip-row">
              {recent.map((r, i) => (
                <span className="chip" key={i}>
                  {r.kind}: {r.query}
                </span>
              ))}
            </div>
            <div className="btnrow" style={{ marginTop: 10 }}>
              <button
                className="btn secondary small"
                onClick={() => {
                  clearRecent();
                  refresh();
                }}
              >
                Clear recent
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
