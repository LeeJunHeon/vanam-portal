// 포털 첫 화면 런처 — 순수 계산 (React·DB 없음, 서버 API 와 화면이 같이 쓴다)
// 메뉴키: `${app}:${page}` (장비 상세처럼 id 가 있으면 `${app}:${page}:${id}`)

export const APP_KEYS = ["inventory", "equipment", "hr", "office", "process", "translator"] as const;
export type AppKey = (typeof APP_KEYS)[number];

export const MENU_KEY_RE = /^(inventory|equipment|hr|office|process|translator):[A-Za-z0-9_-]{1,64}(:[0-9]{1,9})?$/;
export const PAGE_RE = /^[A-Za-z0-9_-]{1,64}$/;

export const PINNED_MAX = 30;
export const HIDDEN_MAX = 200;
export const FREQUENT_MAX = 12;

export interface MenuItem {
  key: string;
  app: AppKey;
  page: string;
  label: string;
  icon: string;
  adminOnly: boolean;
  id?: number;
}

export interface LauncherPrefs {
  pinned: string[];
  hidden: string[];
  appOrder: string[];
}

/** 앱키 → 메뉴 목록. 키가 있으면 그 앱 카탈로그를 받아온 것, 없으면 못 받은 것(앱 꺼짐·미배포 등). */
export type Catalog = Partial<Record<AppKey, MenuItem[]>>;

export const EMPTY_PREFS: LauncherPrefs = { pinned: [], hidden: [], appOrder: [] };

export function isAppKey(v: unknown): v is AppKey {
  return typeof v === "string" && (APP_KEYS as readonly string[]).includes(v);
}

export function isValidPage(v: unknown): v is string {
  return typeof v === "string" && PAGE_RE.test(v);
}

export function isValidMenuId(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 999999999;
}

export function isValidMenuKey(v: unknown): v is string {
  return typeof v === "string" && MENU_KEY_RE.test(v);
}

export function buildMenuKey(app: AppKey, page: string, id?: number): string {
  return id !== undefined ? `${app}:${page}:${id}` : `${app}:${page}`;
}

export function appOfKey(key: string): AppKey | null {
  const app = key.split(":", 1)[0];
  return isAppKey(app) ? app : null;
}

/** 사용 기록 본문 { app, page, id? } 검증. 틀리면 null. */
export function parseUsageBody(body: unknown): { app: AppKey; page: string; id?: number } | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (!isAppKey(b.app) || !isValidPage(b.page)) return null;
  if (b.id === undefined || b.id === null) return { app: b.app, page: b.page };
  if (!isValidMenuId(b.id)) return null;
  return { app: b.app, page: b.page, id: b.id };
}

/** 문자열 배열에서 조건을 통과한 것만 남기고 중복 제거 후 최대 max 개. */
function filterUnique(arr: unknown[], ok: (v: unknown) => v is string, max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of arr) {
    if (!ok(v) || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

/** PUT 본문 검증·정리. 셋 중 하나라도 배열이 아니면 null(400). */
export function sanitizePrefsInput(body: unknown): LauncherPrefs | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.pinned) || !Array.isArray(b.hidden) || !Array.isArray(b.appOrder)) return null;
  return {
    pinned: filterUnique(b.pinned, isValidMenuKey, PINNED_MAX),
    hidden: filterUnique(b.hidden, isValidMenuKey, HIDDEN_MAX),
    appOrder: filterUnique(b.appOrder, isAppKey, APP_KEYS.length),
  };
}

/** DB·캐시에서 읽은 값(jsonb 등)을 prefs 로. 배열이 아니면 빈 배열. */
export function prefsFromStored(pinned: unknown, hidden: unknown, appOrder: unknown): LauncherPrefs {
  return {
    pinned: Array.isArray(pinned) ? filterUnique(pinned, isValidMenuKey, PINNED_MAX) : [],
    hidden: Array.isArray(hidden) ? filterUnique(hidden, isValidMenuKey, HIDDEN_MAX) : [],
    appOrder: Array.isArray(appOrder) ? filterUnique(appOrder, isAppKey, APP_KEYS.length) : [],
  };
}

/** 앱 순서: appOrder 중 유효한 키를 먼저(중복 제거), 빠진 앱은 기본 순서로 뒤에. 항상 APP_KEYS 개수만큼. */
export function normalizeAppOrder(appOrder: readonly unknown[]): AppKey[] {
  const out = filterUnique([...appOrder], isAppKey, APP_KEYS.length) as AppKey[];
  for (const k of APP_KEYS) if (!out.includes(k)) out.push(k);
  return out;
}

/** 앱 portal-menus 응답 → 메뉴 목록. 형식이 틀리면 null(그 앱 카탈로그는 못 받은 것으로). */
export function parseCatalogResponse(app: AppKey, json: unknown): MenuItem[] | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const d = json as Record<string, unknown>;
  if (d.app !== undefined && d.app !== app) return null;
  if (!Array.isArray(d.menus)) return null;
  const out: MenuItem[] = [];
  const seen = new Set<string>();
  for (const m of d.menus) {
    if (!m || typeof m !== "object") continue;
    const r = m as Record<string, unknown>;
    if (!isValidPage(r.page) || typeof r.label !== "string" || !r.label.trim()) continue;
    const id = isValidMenuId(r.id) ? r.id : undefined;
    const key = buildMenuKey(app, r.page, id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      app,
      page: r.page,
      label: r.label.trim(),
      icon: typeof r.icon === "string" ? r.icon : "",
      adminOnly: r.adminOnly === true,
      ...(id !== undefined ? { id } : {}),
    });
  }
  return out;
}

/** 메뉴 여는 주소 (같은 origin 앱 경로). */
export function menuHref(appBase: string, item: Pick<MenuItem, "page" | "id">): string {
  let href = `${appBase}?page=${encodeURIComponent(item.page)}`;
  if (item.id !== undefined) href += `&id=${item.id}`;
  return href;
}

/** 보이는 앱 순서대로 카탈로그를 한 줄로 (= "카탈로그 순서"). */
export function flattenCatalog(catalog: Catalog, appOrder: readonly AppKey[]): MenuItem[] {
  const out: MenuItem[] = [];
  for (const app of appOrder) {
    const list = catalog[app];
    if (list) out.push(...list);
  }
  return out;
}

/**
 * prefs 정리: 카탈로그를 받아온 앱인데 목록에 없는 키는 지운다.
 * 카탈로그를 못 받은 앱의 키는 그대로 둔다(앱이 잠깐 꺼져도 즐겨찾기 유지).
 */
export function cleanPrefs(prefs: LauncherPrefs, catalog: Catalog): LauncherPrefs {
  const known = new Set<string>();
  for (const app of APP_KEYS) for (const m of catalog[app] ?? []) known.add(m.key);
  const keep = (key: string) => {
    const app = appOfKey(key);
    if (!app) return false;
    if (!catalog[app]) return true;
    return known.has(key);
  };
  return {
    pinned: prefs.pinned.filter(keep),
    hidden: prefs.hidden.filter(keep),
    appOrder: prefs.appOrder.filter(isAppKey),
  };
}

/** 즐겨찾기 표시 목록: pinned 순서대로, 보이는 카탈로그에 있는 것만. */
export function selectPinned(pinned: readonly string[], visible: readonly MenuItem[]): MenuItem[] {
  const byKey = new Map(visible.map((m) => [m.key, m]));
  const out: MenuItem[] = [];
  for (const k of pinned) {
    const m = byKey.get(k);
    if (m) out.push(m);
  }
  return out;
}

/**
 * 자주 쓰는 메뉴: 점수 > 0, 즐겨찾기·숨김 아님, 점수 내림차순(같으면 카탈로그 순서), 상위 limit 개.
 * visible 은 카탈로그 순서로 펼친 목록(flattenCatalog).
 */
export function selectFrequent(
  visible: readonly MenuItem[],
  scores: Readonly<Record<string, number>>,
  prefs: Pick<LauncherPrefs, "pinned" | "hidden">,
  limit: number = FREQUENT_MAX,
): MenuItem[] {
  const excluded = new Set([...prefs.pinned, ...prefs.hidden]);
  return visible
    .map((m, idx) => ({ m, idx, s: scores[m.key] ?? 0 }))
    .filter((x) => Number.isFinite(x.s) && x.s > 0 && !excluded.has(x.m.key))
    .sort((a, b) => b.s - a.s || a.idx - b.idx)
    .slice(0, limit)
    .map((x) => x.m);
}

/** 전체 메뉴: 앱 순서대로 묶음. filter 가 앱키면 그 앱만. 메뉴가 없는 앱은 뺀다. */
export function groupAllMenus(
  catalog: Catalog,
  appOrder: readonly AppKey[],
  filter: AppKey | "all" = "all",
): Array<{ app: AppKey; items: MenuItem[] }> {
  const out: Array<{ app: AppKey; items: MenuItem[] }> = [];
  for (const app of appOrder) {
    if (filter !== "all" && filter !== app) continue;
    const items = catalog[app];
    if (items && items.length > 0) out.push({ app, items });
  }
  return out;
}

// ── 편집 동작 (새 prefs 를 돌려준다) ──

export function addPin(prefs: LauncherPrefs, key: string): { prefs: LauncherPrefs; error?: "limit" } {
  if (prefs.pinned.includes(key)) return { prefs };
  if (prefs.pinned.length >= PINNED_MAX) return { prefs, error: "limit" };
  return {
    prefs: { ...prefs, pinned: [...prefs.pinned, key], hidden: prefs.hidden.filter((k) => k !== key) },
  };
}

export function removePin(prefs: LauncherPrefs, key: string): LauncherPrefs {
  return { ...prefs, pinned: prefs.pinned.filter((k) => k !== key) };
}

/** 자주 쓰는 메뉴에서 숨기기/다시 표시. 즐겨찾기에 있던 메뉴를 숨기면 즐겨찾기에서 뺀다. */
export function toggleHidden(prefs: LauncherPrefs, key: string): LauncherPrefs {
  if (prefs.hidden.includes(key)) {
    return { ...prefs, hidden: prefs.hidden.filter((k) => k !== key) };
  }
  return {
    ...prefs,
    hidden: [...prefs.hidden, key].slice(-HIDDEN_MAX),
    pinned: prefs.pinned.filter((k) => k !== key),
  };
}

/** 배열에서 from 항목을 to 항목 자리로 옮긴다(둘 중 하나라도 없으면 그대로). */
export function moveItem<T>(arr: readonly T[], from: T, to: T): T[] {
  const i = arr.indexOf(from);
  const j = arr.indexOf(to);
  if (i < 0 || j < 0 || i === j) return [...arr];
  const out = [...arr];
  out.splice(i, 1);
  out.splice(j, 0, from);
  return out;
}

/**
 * 보이는 즐겨찾기끼리 순서를 바꿀 때, 보이지 않는(카탈로그를 못 받은 앱의) 키 자리는 유지한다.
 * visibleOrder 는 드래그 후 보이는 키 순서.
 */
export function reorderPinned(pinned: readonly string[], visibleOrder: readonly string[]): string[] {
  const visibleSet = new Set(visibleOrder);
  let vi = 0;
  return pinned.map((k) => (visibleSet.has(k) ? visibleOrder[vi++] : k));
}
