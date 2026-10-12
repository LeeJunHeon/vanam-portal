// 런처 브라우저 쪽 도우미: sessionStorage 캐시, 사용 기록 전송, 카탈로그 받기
import {
  APP_KEYS, type AppKey, type Catalog, type LauncherPrefs, type MenuItem,
  parseCatalogResponse, prefsFromStored,
} from "@/lib/launcher";
import { PORTAL_APPS } from "@/lib/portal-apps";

const CACHE_KEY = "portalLauncher:v1";

export interface LauncherSnapshot {
  catalog: Catalog;
  prefs: LauncherPrefs;
  scores: Record<string, number>;
}

export function readCache(): LauncherSnapshot | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Record<string, unknown>;
    const catalog: Catalog = {};
    const c = (d.catalog ?? {}) as Record<string, unknown>;
    for (const app of APP_KEYS) {
      if (c[app] === undefined) continue;
      const list = parseCatalogResponse(app, { app, menus: c[app] });
      if (list) catalog[app] = list;
    }
    const p = (d.prefs ?? {}) as Record<string, unknown>;
    const scores: Record<string, number> = {};
    for (const [k, v] of Object.entries((d.scores ?? {}) as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) scores[k] = v;
    }
    return { catalog, prefs: prefsFromStored(p.pinned, p.hidden, p.appOrder), scores };
  } catch {
    return null;
  }
}

export function writeCache(snap: LauncherSnapshot): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(snap));
  } catch {}
}

/** 서버 배치·점수. 실패하면 null. */
export async function fetchLauncher(): Promise<{ prefs: LauncherPrefs; scores: Record<string, number> } | null> {
  try {
    const r = await fetch("/api/launcher", { cache: "no-store" });
    if (!r.ok) return null;
    const d = (await r.json()) as { prefs?: Record<string, unknown>; scores?: Record<string, unknown> };
    if (!d?.prefs) return null;
    const scores: Record<string, number> = {};
    for (const [k, v] of Object.entries(d.scores ?? {})) {
      if (typeof v === "number" && Number.isFinite(v)) scores[k] = v;
    }
    return { prefs: prefsFromStored(d.prefs.pinned, d.prefs.hidden, d.prefs.appOrder), scores };
  } catch {
    return null;
  }
}

/** 5개 앱 portal-menus. 실패한 앱(꺼짐·미배포·401·JSON 아님)은 카탈로그에서 빠진다. */
export async function fetchCatalog(): Promise<Catalog> {
  const results = await Promise.all(
    APP_KEYS.map(async (app): Promise<[AppKey, MenuItem[] | null]> => {
      try {
        const r = await fetch(`${PORTAL_APPS[app].base}/api/portal-menus`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!r.ok) return [app, null];
        return [app, parseCatalogResponse(app, await r.json())];
      } catch {
        return [app, null];
      }
    }),
  );
  const catalog: Catalog = {};
  for (const [app, list] of results) if (list) catalog[app] = list;
  return catalog;
}

/** 런처에서 메뉴를 누를 때 사용 기록 (링크 이동은 막지 않는다). */
export function sendUsage(item: Pick<MenuItem, "app" | "page" | "id">): void {
  const body = JSON.stringify(
    item.id !== undefined ? { app: item.app, page: item.page, id: item.id } : { app: item.app, page: item.page },
  );
  try {
    if (navigator.sendBeacon?.("/api/launcher/usage", new Blob([body], { type: "application/json" }))) return;
  } catch {}
  fetch("/api/launcher/usage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

/** 한 메뉴의 본인 사용 기록 지우기. 성공하면 true. */
export function deleteUsage(key: string): Promise<boolean> {
  return fetch("/api/launcher/usage", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  })
    .then((r) => r.ok)
    .catch(() => false);
}

export function putPrefs(prefs: LauncherPrefs, keepalive = false): Promise<boolean> {
  return fetch("/api/launcher/prefs", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(prefs),
    keepalive,
  })
    .then((r) => r.ok)
    .catch(() => false);
}
