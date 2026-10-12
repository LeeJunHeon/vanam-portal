"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EMPTY_PREFS, type LauncherPrefs,
  cleanPrefs, flattenCatalog, normalizeAppOrder, selectFrequent,
} from "@/lib/launcher";
import {
  type LauncherSnapshot, fetchCatalog, fetchLauncher, putPrefs, readCache, writeCache,
} from "./launcher-client";

const SAVE_DELAY = 500;

interface LauncherState extends LauncherSnapshot {
  ready: boolean;      // 캐시나 서버 데이터로 그릴 수 있음 (아니면 스켈레톤)
  synced: boolean;     // 서버 배치를 받았음 (편집 가능)
  frequent: string[];  // 자주 쓰는 메뉴 순서 — 데이터를 받을 때 한 번 정한다
}

// 자주 쓰는 메뉴 후보 순서 (보는 동안 다시 정렬하지 않도록 데이터 받을 때만 계산)
function rankFrequent(snap: LauncherSnapshot): string[] {
  const items = flattenCatalog(snap.catalog, normalizeAppOrder(snap.prefs.appOrder));
  return selectFrequent(items, snap.scores, snap.prefs, Infinity).map((m) => m.key);
}

export function useLauncher(onSaveError: () => void) {
  const [state, setState] = useState<LauncherState>({
    catalog: {}, prefs: EMPTY_PREFS, scores: {}, ready: false, synced: false, frequent: [],
  });
  const stateRef = useRef(state);
  const pendingRef = useRef<LauncherPrefs | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false); // 서버 응답 전에 편집했으면 서버 prefs 로 덮지 않음
  const saveChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const onSaveErrorRef = useRef(onSaveError);

  useEffect(() => {
    onSaveErrorRef.current = onSaveError;
  }, [onSaveError]);

  const apply = useCallback((next: LauncherState) => {
    stateRef.current = next;
    setState(next);
    writeCache({ catalog: next.catalog, prefs: next.prefs, scores: next.scores });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const cached = readCache();
    if (cached) {
      // sessionStorage 캐시는 마운트 뒤에만 읽을 수 있다(서버 렌더와 첫 화면을 맞추기 위해)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      apply({ ...cached, ready: true, synced: false, frequent: rankFrequent(cached) });
    }
    Promise.all([fetchLauncher(), fetchCatalog()]).then(([server, catalog]) => {
      if (cancelled) return;
      const cur = stateRef.current;
      const prefs = dirtyRef.current ? cur.prefs : server?.prefs ?? cur.prefs;
      const scores = server?.scores ?? cur.scores;
      const snap = { catalog, prefs, scores };
      apply({ ...snap, ready: true, synced: cur.synced || server !== null, frequent: rankFrequent(snap) });
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    // 카탈로그를 받아온 앱인데 목록에 없는 키는 저장할 때 정리
    const cleaned = cleanPrefs(pending, stateRef.current.catalog);
    if (stateRef.current.prefs === pending) apply({ ...stateRef.current, prefs: cleaned });
    saveChainRef.current = saveChainRef.current.then(() =>
      putPrefs(cleaned).then((ok) => {
        if (!ok) onSaveErrorRef.current();
      }),
    );
  }, [apply]);

  /** 배치 변경: 화면에 바로 반영하고 500ms 뒤 저장. */
  const updatePrefs = useCallback(
    (fn: (cur: LauncherPrefs) => LauncherPrefs, opts?: { rerank?: boolean; immediate?: boolean }) => {
      const cur = stateRef.current;
      const prefs = fn(cur.prefs);
      if (prefs === cur.prefs) return;
      dirtyRef.current = true;
      const next = { ...cur, prefs };
      if (opts?.rerank) next.frequent = rankFrequent(next);
      apply(next);
      pendingRef.current = prefs;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (opts?.immediate) flush();
      else timerRef.current = setTimeout(flush, SAVE_DELAY);
    },
    [apply, flush],
  );

  // 페이지를 떠날 때 대기 중인 저장은 keepalive 로
  useEffect(() => {
    const onHide = () => {
      const pending = pendingRef.current;
      if (!pending) return;
      pendingRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
      void putPrefs(cleanPrefs(pending, stateRef.current.catalog), true);
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  return { ...state, updatePrefs, flush };
}
