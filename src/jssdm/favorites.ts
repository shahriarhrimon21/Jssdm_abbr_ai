/**
 * Ported 1:1 from /tmp/mil/shell_bottom.html — per-viewer localStorage state
 * (favorites + recent lookups). Never modifies the JSSDM data itself.
 */
export interface RecentEntry {
  kind: string;
  query: string;
}

const LS_FAV = "jssdm_favorites_v1";
const LS_RECENT = "jssdm_recent_v1";

function lsGet<T>(key: string): T[] {
  try {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    return v ? (JSON.parse(v) as T[]) : [];
  } catch {
    return [];
  }
}
function lsSet<T>(key: string, val: T[]): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* ignore quota/availability errors, matching the original best-effort behavior */
  }
}

export function getFavorites(): number[] {
  return lsGet<number>(LS_FAV);
}
export function isFavorite(id: number): boolean {
  return getFavorites().indexOf(id) !== -1;
}
export function toggleFavorite(id: number): void {
  const favs = getFavorites();
  const i = favs.indexOf(id);
  if (i === -1) favs.unshift(id);
  else favs.splice(i, 1);
  lsSet(LS_FAV, favs);
}
export function getRecent(): RecentEntry[] {
  return lsGet<RecentEntry>(LS_RECENT);
}
export function addRecent(kind: string, query: string): void {
  if (!query) return;
  let rec = getRecent();
  rec = rec.filter((r) => !(r.kind === kind && r.query === query));
  rec.unshift({ kind, query });
  if (rec.length > 25) rec = rec.slice(0, 25);
  lsSet(LS_RECENT, rec);
}
export function clearRecent(): void {
  lsSet(LS_RECENT, []);
}
export function clearFavorites(): void {
  lsSet(LS_FAV, []);
}
